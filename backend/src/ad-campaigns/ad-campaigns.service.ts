import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  AdCampaign,
  AdCampaignDocument,
  AdCampaignStatus,
} from './schemas/ad-campaign.schema';
import { CreateAdCampaignDto } from './dto/create-ad-campaign.dto';
import type { ListAdCampaignTransactionsQueryDto } from './dto/list-ad-campaign-transactions-query.dto';
import { canTransition } from './ad-campaign-state-machine';
import { resolveDailyRate } from './ad-campaign-pricing';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StoresService } from '../stores/stores.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentProviderResolver } from '../payments/provider-resolver';
import type { PaymentProvider } from '../payments/payment-provider';
import { StripeAdapter } from '../payments/adapters/stripe.adapter';
import { PaystackAdapter } from '../payments/adapters/paystack.adapter';
import { FlutterwaveAdapter } from '../payments/adapters/flutterwave.adapter';
import type {
  PaymentAdapter,
  InitiatePaymentResult,
  VerifyPaymentResult,
} from '../payments/adapters/payment-adapter.interface';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import type { PaginatedResult } from '../restaurants/restaurants.service';

type VendorType = 'restaurant' | 'store';

interface VendorSummary {
  type: VendorType;
  id: string;
  name: string;
  ownerId: string;
  currency: string;
}

// Same discriminated-union-plus-batched-lookup shape as PromoCodeScope/PromoCodesService.findAll
// (docs/ROADMAP.md FDP-112) — a raw restaurantId/storeId means nothing to an admin at a glance.
export type AdCampaignVendor =
  | { type: 'restaurant'; id: string; name: string }
  | { type: 'store'; id: string; name: string };

export interface AdCampaignAdminView {
  _id: string;
  status: AdCampaignStatus;
  paymentStatus: AdCampaign['paymentStatus'];
  startDate: Date;
  endDate: Date;
  durationDays: number;
  currency: string;
  dailyRate: number;
  totalPrice: number;
  priceOverridden: boolean;
  paymentProvider: PaymentProvider | null;
  markedPaidManually: boolean;
  cancelledAt: Date | null;
  cancelReason: string | null;
  adminNotes: string;
  createdAt: Date;
  updatedAt: Date;
  vendor: AdCampaignVendor;
}

@Injectable()
export class AdCampaignsService {
  private readonly logger = new Logger(AdCampaignsService.name);

  constructor(
    @InjectModel(AdCampaign.name)
    private readonly adCampaignModel: Model<AdCampaignDocument>,
    private readonly restaurantsService: RestaurantsService,
    private readonly storesService: StoresService,
    private readonly notificationsService: NotificationsService,
    private readonly providerResolver: PaymentProviderResolver,
    private readonly config: ConfigService,
    private readonly stripeAdapter: StripeAdapter,
    private readonly paystackAdapter: PaystackAdapter,
    private readonly flutterwaveAdapter: FlutterwaveAdapter,
  ) {}

  private getAdapter(provider: PaymentProvider): PaymentAdapter {
    switch (provider) {
      case 'stripe':
        return this.stripeAdapter;
      case 'paystack':
        return this.paystackAdapter;
      case 'flutterwave':
        return this.flutterwaveAdapter;
    }
  }

  /** Loads whichever vendor (restaurant or store) a campaign document targets — every write path
   * below goes through this rather than re-deriving the branch itself. */
  private async loadVendor(
    campaign: Pick<AdCampaign, 'restaurantId' | 'storeId'>,
  ): Promise<VendorSummary> {
    if (campaign.restaurantId != null) {
      const restaurant = await this.restaurantsService.findByIdOrThrow(
        campaign.restaurantId.toString(),
      );
      return {
        type: 'restaurant',
        id: restaurant._id.toString(),
        name: restaurant.name,
        ownerId: restaurant.ownerId.toString(),
        currency: restaurant.currency,
      };
    }
    if (campaign.storeId != null) {
      const store = await this.storesService.findByIdOrThrow(
        campaign.storeId.toString(),
      );
      return {
        type: 'store',
        id: store._id.toString(),
        name: store.name,
        ownerId: store.ownerId.toString(),
        currency: store.currency,
      };
    }
    // Unreachable given create()'s own validation, but keeps loadVendor total rather than
    // returning undefined for a malformed/legacy document.
    throw new NotFoundException('This campaign has no vendor set');
  }

  private async setVendorSponsorship(
    campaign: Pick<AdCampaign, 'restaurantId' | 'storeId'>,
    sponsoredUntil: Date | null,
  ): Promise<void> {
    if (campaign.restaurantId != null) {
      await this.restaurantsService.setSponsorship(
        campaign.restaurantId.toString(),
        sponsoredUntil,
      );
    } else if (campaign.storeId != null) {
      await this.storesService.setSponsorship(
        campaign.storeId.toString(),
        sponsoredUntil,
      );
    }
  }

  private async notifyVendor(
    ownerId: string,
    type:
      | 'ad_campaign_created'
      | 'ad_campaign_payment_failed'
      | 'ad_campaign_active'
      | 'ad_campaign_ended',
    title: string,
    body: string,
  ): Promise<void> {
    try {
      await this.notificationsService.notify({
        userId: ownerId,
        type,
        title,
        body,
      });
    } catch (err) {
      this.logger.error(
        `Notification (${type}) for owner ${ownerId} failed`,
        err,
      );
    }
  }

  /**
   * Admin-only (docs/ROADMAP.md FDP-124) — the vendor never requests a campaign, per the
   * platform's ad model: admin decides who gets advertised and for how long, the vendor pays to
   * activate it. Exactly one of restaurantId/storeId required (never platform-wide, unlike
   * PromoCode). Rejects a second non-terminal campaign for the same vendor up front (the real
   * guarantee is the schema's partial unique index — see its own comment — this is just a
   * friendlier error than a raw duplicate-key one).
   */
  async create(
    dto: CreateAdCampaignDto,
    admin: AccessTokenPayload,
  ): Promise<AdCampaignDocument> {
    if (!dto.restaurantId && !dto.storeId) {
      throw new BadRequestException('Provide either restaurantId or storeId');
    }
    if (dto.restaurantId && dto.storeId) {
      throw new BadRequestException(
        'An ad campaign can target a restaurant or a store, not both',
      );
    }

    const vendor = dto.restaurantId
      ? await (async () => {
          const restaurant = await this.restaurantsService.findByIdOrThrow(
            dto.restaurantId!,
          );
          return {
            type: 'restaurant' as const,
            id: restaurant._id.toString(),
            currency: restaurant.currency,
          };
        })()
      : await (async () => {
          const store = await this.storesService.findByIdOrThrow(dto.storeId!);
          return {
            type: 'store' as const,
            id: store._id.toString(),
            currency: store.currency,
          };
        })();

    const existing = await this.adCampaignModel
      .findOne({
        ...(vendor.type === 'restaurant'
          ? { restaurantId: vendor.id }
          : { storeId: vendor.id }),
        status: { $in: ['pending_payment', 'scheduled', 'active'] },
      })
      .exec();
    if (existing) {
      throw new BadRequestException(
        'This vendor already has an active or pending ad campaign — cancel or wait for it to end before creating another',
      );
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + dto.durationDays);

    const dailyRate = resolveDailyRate(vendor.currency);
    const totalPrice = dto.totalPriceOverride ?? dailyRate * dto.durationDays;

    let campaign: AdCampaignDocument;
    try {
      campaign = await this.adCampaignModel.create({
        restaurantId: vendor.type === 'restaurant' ? vendor.id : null,
        storeId: vendor.type === 'store' ? vendor.id : null,
        startDate,
        endDate,
        durationDays: dto.durationDays,
        currency: vendor.currency,
        dailyRate,
        totalPrice,
        priceOverridden: dto.totalPriceOverride !== undefined,
        createdByAdminId: admin.sub,
        adminNotes: dto.adminNotes ?? '',
      });
    } catch (error) {
      // Belt-and-suspenders: the partial unique index is the real race guard (two concurrent
      // creates for the same vendor) — a duplicate-key error here means the pre-check above lost
      // a race, not a bug, so it surfaces the same friendly message rather than a raw Mongo error.
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: number }).code === 11000
      ) {
        throw new BadRequestException(
          'This vendor already has an active or pending ad campaign — cancel or wait for it to end before creating another',
        );
      }
      throw error;
    }

    const fullVendor = await this.loadVendor(campaign);
    await this.notifyVendor(
      fullVendor.ownerId,
      'ad_campaign_created',
      'New ad campaign awaiting payment',
      `${fullVendor.name} has been set up for a sponsored-listing campaign (${dto.durationDays} day${dto.durationDays === 1 ? '' : 's'}, ${fullVendor.currency} ${totalPrice.toFixed(2)}). Pay now to activate it.`,
    );

    return campaign;
  }

  /** Full admin list, enriched with vendor name via the same batched Map<id,name> lookup pattern
   * PromoCodesService.findAll already uses, including its `!= null` loose-check legacy-doc
   * safety (docs/ROADMAP.md FDP-114). */
  async findAllForAdmin(): Promise<AdCampaignAdminView[]> {
    const campaigns = await this.adCampaignModel
      .find()
      .sort({ createdAt: -1 })
      .exec();
    return this.attachVendorNames(campaigns);
  }

  /**
   * Paginated, date-filterable counterpart to findAllForAdmin() above (docs/ROADMAP.md FDP-128)
   * — powers the admin Overview tab's "Advertising Revenue" transaction ledger. Kept as a
   * separate method rather than adding page/limit params to findAllForAdmin() itself: that
   * method's existing caller (the Ad Campaigns admin tab) expects a plain array and every
   * campaign at once (campaign volume is low enough this has never needed pagination), so
   * changing its return shape would be a breaking change for no benefit to that caller.
   * `totalsByCurrency` only counts `paymentStatus: 'succeeded'` campaigns — the same "money
   * actually collected" definition OrdersService.findAllForAdmin's totals use, computed over the
   * whole filtered set, not just the current page.
   */
  async findAllForAdminPaginated(
    query: ListAdCampaignTransactionsQueryDto,
  ): Promise<PaginatedResult<AdCampaignAdminView> & { totalsByCurrency: Record<string, number> }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const filter: Record<string, unknown> = {};
    if (query.from || query.to) {
      const createdAt: Record<string, Date> = {};
      if (query.from) createdAt.$gte = new Date(query.from);
      if (query.to) createdAt.$lte = new Date(query.to);
      filter.createdAt = createdAt;
    }

    const [campaigns, total, revenueRows] = await Promise.all([
      this.adCampaignModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.adCampaignModel.countDocuments(filter).exec(),
      this.adCampaignModel
        .aggregate<{ _id: string; total: number }>([
          { $match: { ...filter, paymentStatus: 'succeeded' } },
          { $group: { _id: '$currency', total: { $sum: '$totalPrice' } } },
        ])
        .exec(),
    ]);

    const totalsByCurrency: Record<string, number> = {};
    for (const row of revenueRows) totalsByCurrency[row._id] = row.total;

    const items = await this.attachVendorNames(campaigns);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      totalsByCurrency,
    };
  }

  private async attachVendorNames(
    campaigns: AdCampaignDocument[],
  ): Promise<AdCampaignAdminView[]> {
    const restaurantIds = [
      ...new Set(
        campaigns
          .filter((c) => c.restaurantId != null)
          .map((c) => c.restaurantId!.toString()),
      ),
    ];
    const storeIds = [
      ...new Set(
        campaigns
          .filter((c) => c.storeId != null)
          .map((c) => c.storeId!.toString()),
      ),
    ];
    const [restaurants, stores] = await Promise.all([
      restaurantIds.length > 0
        ? this.restaurantsService.findByIds(restaurantIds)
        : Promise.resolve([]),
      storeIds.length > 0
        ? this.storesService.findByIds(storeIds)
        : Promise.resolve([]),
    ]);
    const restaurantNameById = new Map(
      restaurants.map((r) => [r._id.toString(), r.name] as const),
    );
    const storeNameById = new Map(
      stores.map((s) => [s._id.toString(), s.name] as const),
    );

    return campaigns.map((campaign) => {
      // A campaign is never genuinely platform-wide by construction (create() always requires
      // exactly one of restaurantId/storeId), but a malformed/legacy document (written outside
      // the service, or predating a field) could still have neither set — same defensive
      // reasoning as PromoCodesService.findAll's FDP-114 postmortem: never call `.toString()` on
      // a value that might be `null`/`undefined` here, fall back to a clearly-labeled placeholder
      // instead of crashing the whole admin list.
      let vendor: AdCampaignVendor;
      if (campaign.restaurantId != null) {
        const id = campaign.restaurantId.toString();
        vendor = {
          type: 'restaurant',
          id,
          name: restaurantNameById.get(id) ?? 'Unknown restaurant',
        };
      } else if (campaign.storeId != null) {
        const id = campaign.storeId.toString();
        vendor = {
          type: 'store',
          id,
          name: storeNameById.get(id) ?? 'Unknown store',
        };
      } else {
        vendor = {
          type: 'store',
          id: campaign._id.toString(),
          name: 'Unknown vendor',
        };
      }
      return {
        ...campaign.toObject(),
        vendor,
      } as unknown as AdCampaignAdminView;
    });
  }

  /** A vendor's own campaigns across every restaurant/store they own — same shape as
   * PromoCodesService.findMine. */
  async findMine(requester: AccessTokenPayload): Promise<AdCampaignDocument[]> {
    const [restaurants, stores] = await Promise.all([
      this.restaurantsService.findMine(requester.sub),
      this.storesService.findMine(requester.sub),
    ]);
    const restaurantIds = restaurants.map((r) => r._id.toString());
    const storeIds = stores.map((s) => s._id.toString());
    if (restaurantIds.length === 0 && storeIds.length === 0) return [];

    return this.adCampaignModel
      .find({
        $or: [
          { restaurantId: { $in: restaurantIds } },
          { storeId: { $in: storeIds } },
        ],
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByIdOrThrow(id: string): Promise<AdCampaignDocument> {
    const campaign = await this.adCampaignModel.findById(id).exec();
    if (!campaign) throw new NotFoundException('Ad campaign not found');
    return campaign;
  }

  findByPaymentRef(reference: string): Promise<AdCampaignDocument | null> {
    return this.adCampaignModel
      .findOne({ $or: [{ paymentRefs: reference }, { paymentRef: reference }] })
      .exec();
  }

  /** Ownership-checked fetch for a vendor-facing route — throws 403 if the requester doesn't own
   * the campaign's restaurant/store and isn't an admin. */
  async findOneForRequester(
    id: string,
    requester: AccessTokenPayload,
  ): Promise<AdCampaignDocument> {
    const campaign = await this.findByIdOrThrow(id);
    await this.assertOwnership(campaign, requester);
    return campaign;
  }

  private async assertOwnership(
    campaign: AdCampaignDocument,
    requester: AccessTokenPayload,
  ): Promise<void> {
    if (requester.role === 'admin') return;
    const vendor = await this.loadVendor(campaign);
    if (vendor.ownerId !== requester.sub) {
      throw new ForbiddenException(
        'You do not have permission to manage this ad campaign',
      );
    }
  }

  /**
   * Starts a real provider checkout for this campaign's total price (docs/ROADMAP.md FDP-124) —
   * this app has no saved/tokenized vendor payment method, so activating a campaign is always a
   * vendor-completed redirect checkout, the exact same shape order payment already uses
   * (PaymentsService.initiatePayment). Vendor-only (never admin) — the checkout email needs to be
   * the paying vendor's own, not an admin's.
   */
  async initiateCampaignPayment(
    campaignId: string,
    requester: AccessTokenPayload,
    providerOverride?: PaymentProvider,
  ): Promise<{ redirectUrl: string }> {
    const campaign = await this.findByIdOrThrow(campaignId);
    await this.assertOwnership(campaign, requester);
    if (campaign.status !== 'pending_payment') {
      throw new BadRequestException('This campaign is not awaiting payment');
    }

    let provider = this.providerResolver.resolveDefault(campaign.currency);
    if (providerOverride) {
      const supported = this.providerResolver.resolve(campaign.currency);
      if (!supported.includes(providerOverride)) {
        throw new BadRequestException(
          `${providerOverride} does not support ${campaign.currency}`,
        );
      }
      provider = providerOverride;
    }

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const adapter = this.getAdapter(provider);

    let result: InitiatePaymentResult;
    try {
      result = await adapter.initiate({
        orderId: campaign._id.toString(),
        orderNumber: `AD-${campaign._id.toString()}`,
        amount: campaign.totalPrice,
        currency: campaign.currency,
        customerEmail: requester.email,
        successUrl: `${frontendUrl}/dashboard/ad-campaigns/${campaign._id.toString()}/callback`,
        cancelUrl: `${frontendUrl}/dashboard/ad-campaigns/${campaign._id.toString()}/callback?cancelled=true`,
      });
    } catch (error) {
      this.logger.error(
        `${provider} initiate failed for ad campaign ${campaign._id.toString()}`,
        error,
      );
      const message =
        error instanceof Error ? error.message : 'Payment provider error';
      throw new BadRequestException(
        `Couldn't start payment with ${provider}: ${message}`,
      );
    }

    campaign.paymentProvider = provider;
    campaign.paymentRef = result.reference;
    campaign.paymentRefs.push(result.reference);
    await campaign.save();

    return { redirectUrl: result.redirectUrl };
  }

  /** Mirrors PaymentsService.handleWebhook exactly — see its own doc comment for the full
   * cross-provider-mismatch/idempotency reasoning, identical here. */
  async handleWebhook(
    providerName: PaymentProvider,
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<void> {
    const adapter = this.getAdapter(providerName);
    let event: Awaited<ReturnType<PaymentAdapter['handleWebhook']>>;
    try {
      event = await adapter.handleWebhook(rawBody, signature);
    } catch (error) {
      this.logger.error(
        `${providerName} ad-campaign webhook handling threw`,
        error,
      );
      return;
    }
    if (!event) return;

    const campaign = await this.findByPaymentRef(event.reference);
    if (!campaign) return;
    if (campaign.paymentProvider !== providerName) {
      this.logger.warn(
        `${providerName} webhook referenced ad campaign ${campaign._id.toString()}, which belongs to ${campaign.paymentProvider} — ignoring`,
      );
      return;
    }

    if (event.success) {
      await this.markPaid(campaign);
    } else {
      await this.markPaymentFailed(campaign);
    }
  }

  /** Client-triggered confirmation right after the provider redirects back — same active-nudge
   * reasoning as PaymentsService.verifyPayment, reusing the same idempotent transition methods
   * the webhook path uses. */
  async verifyPayment(
    campaignId: string,
    requester: AccessTokenPayload,
  ): Promise<AdCampaignDocument> {
    const campaign = await this.findByIdOrThrow(campaignId);
    await this.assertOwnership(campaign, requester);
    if (campaign.status !== 'pending_payment') return campaign;
    if (!campaign.paymentRef) {
      throw new BadRequestException(
        'This campaign has no payment attempt to verify yet',
      );
    }

    const adapter = this.getAdapter(campaign.paymentProvider!);
    let result: VerifyPaymentResult;
    try {
      result = await adapter.verify(campaign.paymentRef);
    } catch (error) {
      this.logger.error(
        `${campaign.paymentProvider} verify failed for ad campaign ${campaignId}`,
        error,
      );
      return campaign;
    }

    if (result.success) {
      return this.markPaid(campaign);
    }
    return this.markPaymentFailed(campaign);
  }

  /** Idempotent success transition, shared by the webhook and verify paths — atomic
   * findOneAndUpdate filtered on the current status, same "whichever arrives first wins, the
   * other is a safe no-op" reasoning as OrdersService.markPaidFromWebhook. Promotes straight to
   * `active` (not `scheduled`) when startDate has already arrived, so a same-day campaign goes
   * live immediately rather than waiting for tomorrow's lifecycle sweep. */
  private async markPaid(
    campaign: AdCampaignDocument,
  ): Promise<AdCampaignDocument> {
    const now = new Date();
    const nextStatus: AdCampaignStatus =
      campaign.startDate <= now ? 'active' : 'scheduled';

    const updated = await this.adCampaignModel
      .findOneAndUpdate(
        { _id: campaign._id, status: 'pending_payment' },
        { $set: { status: nextStatus, paymentStatus: 'succeeded' } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated)
      return (await this.adCampaignModel.findById(campaign._id).exec())!;

    if (nextStatus === 'active') {
      await this.setVendorSponsorship(updated, updated.endDate);
      const vendor = await this.loadVendor(updated);
      await this.notifyVendor(
        vendor.ownerId,
        'ad_campaign_active',
        'Your ad campaign is live',
        `${vendor.name} is now showing as Sponsored across the marketplace until ${updated.endDate.toDateString()}.`,
      );
    }
    return updated;
  }

  private async markPaymentFailed(
    campaign: AdCampaignDocument,
  ): Promise<AdCampaignDocument> {
    const updated = await this.adCampaignModel
      .findOneAndUpdate(
        { _id: campaign._id, status: 'pending_payment' },
        { $set: { paymentStatus: 'failed' } },
        { returnDocument: 'after' },
      )
      .exec();
    const result =
      updated ?? (await this.adCampaignModel.findById(campaign._id).exec())!;

    const vendor = await this.loadVendor(result);
    await this.notifyVendor(
      vendor.ownerId,
      'ad_campaign_payment_failed',
      'Ad campaign payment failed',
      `Payment for ${vendor.name}'s ad campaign didn't go through. You can retry from your dashboard.`,
    );
    return result;
  }

  /**
   * Admin's manual close-out for an offline deal (bank transfer, invoiced arrangement) — converges
   * on the exact same activation logic `markPaid` uses, just skipping the online checkout entirely.
   * Only meaningful while still `pending_payment`.
   */
  async markPaidManually(
    campaignId: string,
    admin: AccessTokenPayload,
  ): Promise<AdCampaignDocument> {
    const campaign = await this.findByIdOrThrow(campaignId);
    if (campaign.status !== 'pending_payment') {
      throw new BadRequestException('This campaign is not awaiting payment');
    }
    campaign.markedPaidManually = true;
    campaign.adminNotes = campaign.adminNotes
      ? `${campaign.adminNotes} | Marked paid manually by admin ${admin.email}.`
      : `Marked paid manually by admin ${admin.email}.`;
    await campaign.save();
    return this.markPaid(campaign);
  }

  /**
   * Admin-only. Allowed from `pending_payment`/`scheduled` — nothing charged yet, or charged but
   * not yet live. There is deliberately no path to cancel an already-`active` campaign (confirmed
   * product decision: a paid, live campaign always runs to its natural end date).
   */
  async cancel(
    campaignId: string,
    reason: string | undefined,
  ): Promise<AdCampaignDocument> {
    const campaign = await this.findByIdOrThrow(campaignId);
    if (!canTransition(campaign.status, 'cancelled')) {
      throw new BadRequestException(
        `Cannot cancel a campaign that is ${campaign.status.replace('_', ' ')} — only a campaign still awaiting payment or scheduled to start can be cancelled`,
      );
    }
    campaign.status = 'cancelled';
    campaign.cancelledAt = new Date();
    campaign.cancelReason = reason ?? null;
    await campaign.save();

    const vendor = await this.loadVendor(campaign);
    await this.notifyVendor(
      vendor.ownerId,
      'ad_campaign_ended',
      'Ad campaign cancelled',
      `The ad campaign for ${vendor.name} was cancelled by an admin${reason ? `: ${reason}` : '.'}`,
    );
    return campaign;
  }

  /**
   * The daily lifecycle sweep's body (docs/ROADMAP.md FDP-124) — also callable via the manual
   * admin trigger endpoint. Two passes, each per-item try/caught so one bad vendor lookup can't
   * abort the rest of the sweep, same defensive posture PayoutExecutionService.runWeeklyBatch
   * already documents.
   */
  async runLifecycleSweep(): Promise<{ activated: number; ended: number }> {
    const now = new Date();
    let activated = 0;
    let ended = 0;

    const toActivate = await this.adCampaignModel
      .find({ status: 'scheduled', startDate: { $lte: now } })
      .exec();
    for (const campaign of toActivate) {
      try {
        const updated = await this.adCampaignModel
          .findOneAndUpdate(
            { _id: campaign._id, status: 'scheduled' },
            { $set: { status: 'active' } },
            { returnDocument: 'after' },
          )
          .exec();
        if (!updated) continue;
        await this.setVendorSponsorship(updated, updated.endDate);
        const vendor = await this.loadVendor(updated);
        await this.notifyVendor(
          vendor.ownerId,
          'ad_campaign_active',
          'Your ad campaign is live',
          `${vendor.name} is now showing as Sponsored across the marketplace until ${updated.endDate.toDateString()}.`,
        );
        activated += 1;
      } catch (error) {
        this.logger.error(
          `Lifecycle sweep failed to activate campaign ${campaign._id.toString()}`,
          error,
        );
      }
    }

    const toEnd = await this.adCampaignModel
      .find({ status: 'active', endDate: { $lte: now } })
      .exec();
    for (const campaign of toEnd) {
      try {
        const updated = await this.adCampaignModel
          .findOneAndUpdate(
            { _id: campaign._id, status: 'active' },
            { $set: { status: 'ended' } },
            { returnDocument: 'after' },
          )
          .exec();
        if (!updated) continue;
        await this.setVendorSponsorship(updated, null);
        const vendor = await this.loadVendor(updated);
        await this.notifyVendor(
          vendor.ownerId,
          'ad_campaign_ended',
          'Ad campaign ended',
          `${vendor.name}'s ad campaign has ended. Thanks for advertising with us!`,
        );
        ended += 1;
      } catch (error) {
        this.logger.error(
          `Lifecycle sweep failed to end campaign ${campaign._id.toString()}`,
          error,
        );
      }
    }

    return { activated, ended };
  }
}
