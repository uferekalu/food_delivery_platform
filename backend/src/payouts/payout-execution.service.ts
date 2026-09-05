import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { PaginatedResult } from '../restaurants/restaurants.service';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Payout, PayoutDocument } from './schemas/payout.schema';
import type { PayoutVendorType } from './schemas/payout.schema';
import {
  Restaurant,
  RestaurantDocument,
} from '../restaurants/schemas/restaurant.schema';
import { Store, StoreDocument } from '../stores/schemas/store.schema';
import { Rider, RiderDocument } from '../riders/schemas/rider.schema';
import type { PayoutAccount } from '../common/schemas/payout-account.schema';
import { PayoutsService, UnpaidEarningsGroup } from './payouts.service';
import { StripeAdapter } from '../payments/adapters/stripe.adapter';
import { PaystackAdapter } from '../payments/adapters/paystack.adapter';
import { FlutterwaveAdapter } from '../payments/adapters/flutterwave.adapter';
import { TransferOutcomeUnknownError } from '../payments/adapters/transfer-outcome-unknown.error';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

export interface PayoutBatchSummary {
  succeeded: number;
  failed: number;
  reconciliationNeeded: number;
  skipped: number;
}

type ClaimField = 'vendorPayoutId' | 'riderPayoutId';

/**
 * Weekly payout execution (docs/ROADMAP.md FDP-92) — the piece that actually moves money,
 * consuming `PayoutsService`'s read-only earnings aggregation (FDP-91) and each adapter's
 * `transfer()` method. Runs from `PayoutSchedulerService`'s Monday cron, or on demand via the
 * admin-only manual trigger (`PayoutsController`).
 *
 * Money-safety design (the platform's explicit "no loopholes" requirement):
 * 1. A `Payout` document is created (status `pending`) and its `orderIds` are atomically claimed
 *    on the `Order` collection (`vendorPayoutId`/`riderPayoutId` set from `null` to this payout's
 *    id) *before* any provider is called — an order can never end up counted in two payouts.
 * 2. A confirmed, clean rejection (the provider clearly says the transfer didn't happen) releases
 *    the claimed orders back to `null` so they're automatically retried next week.
 * 3. An ambiguous failure (`TransferOutcomeUnknownError` — the request may or may not have
 *    reached the provider) does NOT release the orders and does NOT get retried automatically —
 *    money might already have moved, so auto-retrying could double-pay. It's flagged
 *    `reconciliationRequired` and every admin gets an urgent notification to check the provider's
 *    own dashboard and resolve it by hand (FDP-93's admin payout view).
 * 4. Any error for one vendor/rider is caught and logged without aborting the rest of the batch —
 *    one bad account must never stop everyone else from being paid.
 */
@Injectable()
export class PayoutExecutionService {
  private readonly logger = new Logger(PayoutExecutionService.name);

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Payout.name)
    private readonly payoutModel: Model<PayoutDocument>,
    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
    @InjectModel(Store.name)
    private readonly storeModel: Model<StoreDocument>,
    @InjectModel(Rider.name)
    private readonly riderModel: Model<RiderDocument>,
    private readonly payoutsService: PayoutsService,
    private readonly stripeAdapter: StripeAdapter,
    private readonly paystackAdapter: PaystackAdapter,
    private readonly flutterwaveAdapter: FlutterwaveAdapter,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  async runWeeklyBatch(): Promise<PayoutBatchSummary> {
    const summary: PayoutBatchSummary = {
      succeeded: 0,
      failed: 0,
      reconciliationNeeded: 0,
      skipped: 0,
    };

    const restaurants = await this.restaurantModel
      .find({ 'payoutAccounts.status': 'active' })
      .exec();
    for (const restaurant of restaurants) {
      await this.processVendor(
        'restaurant',
        restaurant._id.toString(),
        restaurant.ownerId.toString(),
        restaurant.payoutAccounts,
        summary,
      );
    }

    const stores = await this.storeModel
      .find({ 'payoutAccounts.status': 'active' })
      .exec();
    for (const store of stores) {
      await this.processVendor(
        'store',
        store._id.toString(),
        store.ownerId.toString(),
        store.payoutAccounts,
        summary,
      );
    }

    const riders = await this.riderModel
      .find({ 'payoutAccounts.status': 'active' })
      .exec();
    for (const rider of riders) {
      await this.processRider(
        rider._id.toString(),
        rider.userId.toString(),
        rider.payoutAccounts,
        summary,
      );
    }

    this.logger.log(
      `Weekly payout batch complete: ${summary.succeeded} succeeded, ${summary.failed} failed (auto-retry next run), ${summary.reconciliationNeeded} need manual reconciliation, ${summary.skipped} skipped (no matching active payout account for that provider yet).`,
    );
    return summary;
  }

  private async processVendor(
    vendorType: 'restaurant' | 'store',
    vendorId: string,
    ownerUserId: string,
    payoutAccounts: PayoutAccount[],
    summary: PayoutBatchSummary,
  ): Promise<void> {
    let groups: UnpaidEarningsGroup[];
    try {
      groups = await this.payoutsService.getUnpaidVendorEarnings(
        vendorType,
        vendorId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to load unpaid earnings for ${vendorType} ${vendorId}`,
        error,
      );
      return;
    }

    for (const group of groups) {
      await this.attemptGroup(
        vendorType,
        vendorId,
        ownerUserId,
        payoutAccounts,
        group,
        'vendorPayoutId',
        summary,
      );
    }
  }

  private async processRider(
    riderId: string,
    riderUserId: string,
    payoutAccounts: PayoutAccount[],
    summary: PayoutBatchSummary,
  ): Promise<void> {
    let groups: UnpaidEarningsGroup[];
    try {
      groups = await this.payoutsService.getUnpaidRiderEarnings(riderUserId);
    } catch (error) {
      this.logger.error(
        `Failed to load unpaid earnings for rider ${riderId}`,
        error,
      );
      return;
    }

    for (const group of groups) {
      await this.attemptGroup(
        'rider',
        riderId,
        riderUserId,
        payoutAccounts,
        group,
        'riderPayoutId',
        summary,
      );
    }
  }

  private async attemptGroup(
    vendorType: PayoutVendorType,
    vendorId: string,
    notifyUserId: string,
    payoutAccounts: PayoutAccount[],
    group: UnpaidEarningsGroup,
    claimField: ClaimField,
    summary: PayoutBatchSummary,
  ): Promise<void> {
    if (group.grossAmount <= 0 || group.orderIds.length === 0) return;

    const account = payoutAccounts.find(
      (a) => a.provider === group.provider && a.status === 'active',
    );
    if (!account) {
      summary.skipped += 1;
      this.logger.warn(
        `${vendorType} ${vendorId} has unpaid ${group.provider} ${group.currency} earnings but no active ${group.provider} payout account — skipped this run.`,
      );
      return;
    }

    try {
      await this.executePayout(
        vendorType,
        vendorId,
        notifyUserId,
        group,
        account,
        claimField,
        summary,
      );
    } catch (error) {
      // Catch-all so one vendor's unexpected failure (e.g. a DB hiccup between the claim and the
      // save) never aborts the batch for everyone else still queued behind them.
      summary.failed += 1;
      this.logger.error(
        `Unexpected error executing payout for ${vendorType} ${vendorId}`,
        error,
      );
    }
  }

  private async executePayout(
    vendorType: PayoutVendorType,
    vendorId: string,
    notifyUserId: string,
    group: UnpaidEarningsGroup,
    account: PayoutAccount,
    claimField: ClaimField,
    summary: PayoutBatchSummary,
  ): Promise<void> {
    const orderObjectIds = group.orderIds.map((id) => new Types.ObjectId(id));

    const payout = await this.payoutModel.create({
      vendorType,
      vendorId,
      orderIds: orderObjectIds,
      grossAmount: group.grossAmount,
      currency: group.currency,
      provider: group.provider,
      payoutAccountReference: account.reference ?? '',
      status: 'pending',
    });

    const claim = await this.orderModel
      .updateMany(
        { _id: { $in: orderObjectIds }, [claimField]: null },
        { $set: { [claimField]: payout._id.toString() } },
      )
      .exec();

    if (claim.modifiedCount !== group.orderIds.length) {
      // Defensive — should never happen with a single scheduler instance, but claiming fewer
      // orders than expected means the set changed between the aggregation query and this
      // update. Release whatever this attempt did manage to claim rather than paying out an
      // amount that no longer matches what's actually claimed.
      await this.orderModel
        .updateMany(
          { [claimField]: payout._id.toString() },
          { $set: { [claimField]: null } },
        )
        .exec();
      payout.status = 'failed';
      payout.failureReason = `Order claim race: expected to claim ${group.orderIds.length} orders, actually claimed ${claim.modifiedCount}`;
      await payout.save();
      summary.failed += 1;
      this.logger.error(payout.failureReason);
      await this.notifyAdmins(
        'payout_failed',
        'Payout claim race detected',
        `A ${vendorType} payout attempt for vendor ${vendorId} hit an order-claim race and was safely aborted (no transfer was attempted). Payout ID: ${payout._id.toString()}.`,
        payout,
        vendorType,
        vendorId,
      );
      return;
    }

    payout.status = 'processing';
    await payout.save();

    try {
      const result = await this.callAdapterTransfer(payout, account);
      payout.status = 'succeeded';
      payout.providerTransferReference = result.transferReference;
      await payout.save();
      summary.succeeded += 1;
      await this.notifyOne(
        notifyUserId,
        'payout_succeeded',
        'Payout sent',
        `Your weekly payout of ${payout.currency} ${payout.grossAmount.toFixed(2)} has been sent to your ${payout.provider} account.`,
        payout,
        {
          subject: 'Your weekly payout was sent',
          html: `<p>Your weekly payout of ${payout.currency} ${payout.grossAmount.toFixed(2)} has been sent to your ${payout.provider} account.</p>`,
        },
      );
    } catch (error) {
      if (error instanceof TransferOutcomeUnknownError) {
        payout.status = 'failed';
        payout.failureReason = error.message;
        payout.reconciliationRequired = true;
        await payout.save();
        // Deliberately NOT releasing the claimed orders — see the class doc comment and
        // Payout.reconciliationRequired's doc comment for why.
        summary.reconciliationNeeded += 1;
        this.logger.error(
          `Payout ${payout._id.toString()} outcome UNKNOWN — requires manual reconciliation`,
          error,
        );
        await this.notifyAdmins(
          'payout_reconciliation_needed',
          'Payout needs manual reconciliation',
          `A ${vendorType} payout of ${payout.currency} ${payout.grossAmount.toFixed(2)} via ${payout.provider} had an unknown outcome and needs manual review before anything is retried. Check the ${payout.provider} dashboard for a transfer around this time. Payout ID: ${payout._id.toString()}, vendor: ${vendorId}.`,
          payout,
          vendorType,
          vendorId,
        );
      } else {
        const failureReason =
          error instanceof Error ? error.message : 'Unknown transfer error';
        payout.status = 'failed';
        payout.failureReason = failureReason;
        await payout.save();
        await this.orderModel
          .updateMany(
            { [claimField]: payout._id.toString() },
            { $set: { [claimField]: null } },
          )
          .exec();
        summary.failed += 1;
        this.logger.warn(
          `Payout ${payout._id.toString()} failed (confirmed rejection, will retry next run): ${failureReason}`,
        );
        await this.notifyOne(
          notifyUserId,
          'payout_failed',
          "This week's payout failed",
          `Your weekly payout of ${payout.currency} ${payout.grossAmount.toFixed(2)} could not be sent (${failureReason}). It will be retried automatically next week — please check your payout account details are still correct.`,
          payout,
        );
      }
    }
  }

  private callAdapterTransfer(
    payout: PayoutDocument,
    account: PayoutAccount,
  ): Promise<{ transferReference: string }> {
    const reference = payout._id.toString();
    const label = `Weekly payout — ${payout.vendorType} ${payout.vendorId}`;

    if (payout.provider === 'stripe') {
      if (!account.reference) {
        return Promise.reject(
          new Error('Stripe payout account has no connected account id'),
        );
      }
      return this.stripeAdapter.transfer({
        destinationAccountId: account.reference,
        amount: payout.grossAmount,
        currency: payout.currency,
        reference,
        description: label,
      });
    }

    if (payout.provider === 'paystack') {
      if (!account.reference) {
        return Promise.reject(
          new Error('Paystack payout account has no subaccount reference'),
        );
      }
      return this.paystackAdapter.transfer({
        subaccountReference: account.reference,
        amount: payout.grossAmount,
        currency: payout.currency,
        reference,
        reason: label,
      });
    }

    if (!account.bankCode || !account.accountNumber) {
      return Promise.reject(
        new Error(
          'Flutterwave payout account is missing bank details — re-onboard to add them',
        ),
      );
    }
    return this.flutterwaveAdapter.transfer({
      bankCode: account.bankCode,
      accountNumber: account.accountNumber,
      amount: payout.grossAmount,
      currency: payout.currency,
      reference,
      narration: label,
    });
  }

  private async notifyOne(
    userId: string,
    type: 'payout_succeeded' | 'payout_failed',
    title: string,
    body: string,
    payout: PayoutDocument,
    email?: { subject: string; html: string },
  ): Promise<void> {
    try {
      await this.notificationsService.notify({
        userId,
        type,
        title,
        body,
        metadata: {
          payoutId: payout._id.toString(),
          provider: payout.provider,
        },
        email,
      });
    } catch (error) {
      this.logger.error(
        `Failed to notify ${userId} about payout ${payout._id.toString()}`,
        error,
      );
    }
  }

  private async notifyAdmins(
    type: 'payout_failed' | 'payout_reconciliation_needed',
    title: string,
    body: string,
    payout: PayoutDocument,
    vendorType: string,
    vendorId: string,
  ): Promise<void> {
    try {
      const admins = await this.usersService.listAll({
        role: 'admin',
        page: 1,
        limit: 50,
      });
      await Promise.all(
        admins.items.map((admin) =>
          this.notificationsService.notify({
            userId: admin._id.toString(),
            type,
            title,
            body,
            metadata: {
              payoutId: payout._id.toString(),
              vendorType,
              vendorId,
              provider: payout.provider,
            },
            email:
              type === 'payout_reconciliation_needed'
                ? { subject: `URGENT: ${title}`, html: `<p>${body}</p>` }
                : undefined,
          }),
        ),
      );
    } catch (error) {
      this.logger.error('Failed to notify admins about a payout issue', error);
    }
  }

  // --- Payout dashboards (docs/ROADMAP.md FDP-93) ---

  /** A vendor/rider's own payout history, oldest-attempt-last — the same audit trail an admin
   * sees for them, scoped down to just their own records. Caller is responsible for the
   * ownership check (route-level, same pattern as every other vendor-scoped endpoint). */
  async listForVendor(
    vendorType: PayoutVendorType,
    vendorId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<PayoutDocument>> {
    const filter = { vendorType, vendorId };
    const [items, total] = await Promise.all([
      this.payoutModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.payoutModel.countDocuments(filter).exec(),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Every payout, across every vendor/rider — the admin view, optionally filtered. */
  async listAll(query: {
    page: number;
    limit: number;
    status?: PayoutDocument['status'];
    vendorType?: PayoutVendorType;
    reconciliationRequired?: boolean;
  }): Promise<PaginatedResult<PayoutDocument>> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.vendorType) filter.vendorType = query.vendorType;
    if (query.reconciliationRequired !== undefined) {
      filter.reconciliationRequired = query.reconciliationRequired;
    }
    const [items, total] = await Promise.all([
      this.payoutModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.payoutModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  /**
   * The human-in-the-loop close-out for a `reconciliationRequired` payout — an admin has
   * actually checked the provider's own dashboard for a transfer matching this attempt's
   * reference/amount/timing and is telling this system what they found.
   *
   * `transferActuallySucceeded: true` means the admin confirmed the money DID move (the request
   * reached the provider and completed, this system just never got the response) — the claimed
   * orders stay claimed exactly as they are, since they genuinely were paid. `false` means the
   * admin confirmed it did NOT move — the claimed orders are released back to the unpaid pool so
   * they're picked up by the next weekly run, same as a confirmed clean rejection would have been
   * at the time, had the outcome been known then.
   */
  async resolveReconciliation(
    payoutId: string,
    adminUserId: string,
    transferActuallySucceeded: boolean,
  ): Promise<PayoutDocument> {
    const payout = await this.payoutModel.findById(payoutId).exec();
    if (!payout) throw new NotFoundException('Payout not found');
    if (!payout.reconciliationRequired) {
      throw new BadRequestException(
        'This payout is not flagged for reconciliation',
      );
    }

    payout.reconciliationRequired = false;
    payout.reconciledAt = new Date();
    payout.reconciledBy = adminUserId;
    if (transferActuallySucceeded) {
      payout.status = 'succeeded';
    } else {
      payout.status = 'failed';
      const claimField: ClaimField =
        payout.vendorType === 'rider' ? 'riderPayoutId' : 'vendorPayoutId';
      await this.orderModel
        .updateMany(
          { [claimField]: payout._id.toString() },
          { $set: { [claimField]: null } },
        )
        .exec();
    }
    return payout.save();
  }
}
