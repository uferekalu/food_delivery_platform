import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { slugify } from '../common/utils/slugify';
import { escapeRegExp } from '../common/utils/regex';
import { toGeoPoint } from '../common/utils/geo';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { Restaurant, RestaurantDocument } from './schemas/restaurant.schema';
import type { PayoutAccountStatus } from '../common/schemas/payout-account.schema';
import type { PaymentProvider } from '../payments/payment-provider';
import { BusinessVerificationService } from '../business-verification/business-verification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { ListRestaurantsDto } from './dto/list-restaurants.dto';
import type { RestaurantSort } from './dto/list-restaurants.dto';
import type { NearbyQueryDto } from '../common/dto/nearby-query.dto';

/** A restaurant with its computed distance from the query point, in kilometres (docs/ROADMAP.md
 * FDP-96) — never a stored field, only ever present on `findNearby`'s output. */
export type RestaurantWithDistance = Restaurant & { distanceKm: number };

const SORT_SPECS: Record<RestaurantSort, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  rating: { avgRating: -1 },
  price_asc: { priceLevel: 1 },
  price_desc: { priceLevel: -1 },
  // Restaurants that never set an estimate (`null`) sort last regardless of direction — nothing
  // useful to show a customer filtering/sorting by delivery time otherwise.
  delivery_time: { estimatedDeliveryMinutes: 1 },
};

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class RestaurantsService {
  private readonly logger = new Logger(RestaurantsService.name);

  constructor(
    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
    private readonly businessVerificationService: BusinessVerificationService,
    // forwardRef here (docs/ROADMAP.md FDP-115) — see RestaurantsModule's doc comment for the
    // full cycle this breaks: RestaurantsModule -> NotificationsModule -> UsersModule ->
    // RestaurantsModule (UsersService already depends on RestaurantsService).
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    ownerId: string,
    dto: CreateRestaurantDto,
  ): Promise<RestaurantDocument> {
    const slug = await this.generateUniqueSlug(dto.name);
    const restaurant = await this.restaurantModel.create({
      ...dto,
      ownerId,
      slug,
      // "Near me" (docs/ROADMAP.md FDP-96) — see toGeoPoint's doc comment.
      address: {
        ...dto.address,
        location: toGeoPoint(dto.address.lat, dto.address.lng),
      },
    });
    // Never allowed to fail restaurant creation itself (docs/ROADMAP.md FDP-115) — a Youverify
    // outage must degrade to "falls into the manual admin queue", exactly like an unconfigured
    // API key, never to a 500 on registration.
    await this.runVerification(
      restaurant,
      dto.businessRegistrationNumber,
      dto.name,
    );
    return restaurant;
  }

  async findAllApproved(
    query: ListRestaurantsDto,
  ): Promise<PaginatedResult<RestaurantDocument>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const filter: QueryFilter<RestaurantDocument> = { isApproved: true };
    if (query.cuisine) filter.cuisineTypes = query.cuisine;
    if (query.search) {
      // Case-insensitive substring match, not MongoDB's word-tokenized `$text` search (used
      // here previously) — a customer typing "fd" expects it to match "FDP15 Test Kitchen"
      // (a partial word), which `$text` never would, since it only matches whole tokens/stems.
      const pattern = escapeRegExp(query.search.trim());
      filter.$or = [
        { name: { $regex: pattern, $options: 'i' } },
        { cuisineTypes: { $regex: pattern, $options: 'i' } },
      ];
    }
    if (query.minRating) filter.avgRating = { $gte: query.minRating };
    if (query.maxPriceLevel) filter.priceLevel = { $lte: query.maxPriceLevel };
    if (query.maxDeliveryMinutes !== undefined) {
      // `$lte` alone would also match `null` (MongoDB treats a missing/null field as satisfying
      // no comparison operator except $exists/$type) — explicitly requiring the field to exist
      // keeps restaurants that never set an estimate out of a time-bounded search rather than
      // letting them slip through.
      filter.estimatedDeliveryMinutes = {
        $lte: query.maxDeliveryMinutes,
        $exists: true,
        $ne: null,
      };
    }
    const sort = SORT_SPECS[query.sort ?? 'newest'];
    if (query.sort === 'delivery_time' && !filter.estimatedDeliveryMinutes) {
      // Same reasoning as above: sorting by a field that's null for most restaurants would put
      // them first (MongoDB sorts null/missing ahead of numbers in ascending order) — excluding
      // them keeps the sorted list actually meaningful.
      filter.estimatedDeliveryMinutes = { $exists: true, $ne: null };
    }

    const [items, total] = await Promise.all([
      this.restaurantModel
        .find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort(sort)
        .exec(),
      this.restaurantModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * "Restaurants near me" (docs/ROADMAP.md FDP-96) — real geospatial search via `$geoNear`
   * (needs the `address.location` 2dsphere index), not an in-memory haversine sort over every
   * approved restaurant. `$geoNear` must be the pipeline's first stage, and MongoDB requires
   * *some* geospatial index on the queried field to exist for it to run at all — this is also
   * why it silently excludes any restaurant with no `address.location` set, rather than treating
   * a missing location as infinitely far away or erroring. `$facet` gets both the current page
   * and the total count in one round trip rather than two separate aggregations.
   */
  async findNearby(
    query: NearbyQueryDto,
  ): Promise<PaginatedResult<RestaurantWithDistance>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const radiusKm = query.radiusKm ?? 10;

    const [result] = await this.restaurantModel
      .aggregate<{
        items: (RestaurantWithDistance & { distanceMeters: number })[];
        totalCount: { count: number }[];
      }>([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [query.lng, query.lat] },
            distanceField: 'distanceMeters',
            maxDistance: radiusKm * 1000,
            spherical: true,
            query: { isApproved: true },
          },
        },
        {
          $facet: {
            items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
            totalCount: [{ $count: 'count' }],
          },
        },
      ])
      .exec();

    const total = result.totalCount[0]?.count ?? 0;
    const items = result.items.map((item) => ({
      ...item,
      // Meters -> km, rounded to 1 decimal place — matches how the frontend displays it
      // ("1.2 km away"), no reason to ship more precision than that over the wire.
      distanceKm: Math.round((item.distanceMeters / 1000) * 10) / 10,
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Public lookup — deliberately requires `isApproved`, same as `findAllApproved`. A pending
   * restaurant's page must not be reachable just by knowing/guessing its slug before an admin
   * has approved it. The owner previews their own pending restaurant via `findMine` instead.
   */
  async findBySlug(slug: string): Promise<RestaurantDocument> {
    const restaurant = await this.restaurantModel
      .findOne({ slug: slug.toLowerCase(), isApproved: true })
      .exec();
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return restaurant;
  }

  /** Admin-only queue of restaurants awaiting approval — oldest first, same "process in received
   * order" rationale as the restaurant/rider order queues (docs/ROADMAP.md FDP-20). */
  findPendingApproval(): Promise<RestaurantDocument[]> {
    return this.restaurantModel
      .find({ isApproved: false })
      .sort({ createdAt: 1 })
      .exec();
  }

  /** Every restaurant regardless of approval status — for admin pickers that must be able to
   * target ANY restaurant, not just already-approved ones (e.g. scoping an admin-created promo
   * code to a restaurant still awaiting approval — a real bug the user hit, docs/ROADMAP.md
   * FDP-116). `findAllApproved`/`findAll` are both public and approval-filtered, wrong for this.
   * Sorted by name for a predictable, scannable picker rather than by recency. */
  findAllForAdmin(): Promise<RestaurantDocument[]> {
    return this.restaurantModel.find().sort({ name: 1 }).exec();
  }

  /** Feeds the admin analytics overview — how many restaurants are live vs. still awaiting
   * approval. */
  async countByApproval(): Promise<{ approved: number; pending: number }> {
    const [approved, pending] = await Promise.all([
      this.restaurantModel.countDocuments({ isApproved: true }).exec(),
      this.restaurantModel.countDocuments({ isApproved: false }).exec(),
    ]);
    return { approved, pending };
  }

  findMine(ownerId: string): Promise<RestaurantDocument[]> {
    return this.restaurantModel
      .find({ ownerId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByIdOrThrow(id: string): Promise<RestaurantDocument> {
    const restaurant = await this.restaurantModel.findById(id).exec();
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return restaurant;
  }

  /** Bulk lookup for a set of ids (e.g. a user's favorites) — silently drops ids that no
   * longer resolve to a restaurant rather than throwing, since a favorited restaurant could
   * have been removed after the fact. */
  findByIds(ids: string[]): Promise<RestaurantDocument[]> {
    return this.restaurantModel.find({ _id: { $in: ids } }).exec();
  }

  async update(
    id: string,
    requester: AccessTokenPayload,
    dto: UpdateRestaurantDto,
  ): Promise<RestaurantDocument> {
    const restaurant = await this.findByIdOrThrow(id);
    this.assertOwnerOrAdmin(restaurant, requester);
    // Editing any publicly-rendered content field re-requires admin approval — `approve()` is
    // the only gate on what actually goes live (`findBySlug` only serves `isApproved: true`
    // restaurants), but nothing previously stopped an already-approved owner from silently
    // swapping in different name/description/images afterward and staying live with unreviewed
    // content. Only these content-bearing fields reset it; operational edits (hours, price
    // level, delivery estimate, address) don't need a human to look at them again.
    const CONTENT_FIELDS = [
      'name',
      'description',
      'cuisineTypes',
      'logoUrl',
      'coverUrl',
    ] as const;
    if (
      restaurant.isApproved &&
      CONTENT_FIELDS.some((field) => dto[field] !== undefined)
    ) {
      restaurant.isApproved = false;
    }
    Object.assign(restaurant, dto);
    // "Near me" (docs/ROADMAP.md FDP-96) — re-derived whenever the address itself changes (an
    // owner correcting a typo'd coordinate must also correct where the geospatial index thinks
    // they are), left untouched otherwise since `dto.address` is optional on a partial update.
    if (dto.address) {
      restaurant.address.location = toGeoPoint(
        dto.address.lat,
        dto.address.lng,
      );
    }
    return restaurant.save();
  }

  async toggleOpen(
    id: string,
    requester: AccessTokenPayload,
  ): Promise<RestaurantDocument> {
    const restaurant = await this.findByIdOrThrow(id);
    this.assertOwnerOrAdmin(restaurant, requester);
    restaurant.isOpen = !restaurant.isOpen;
    return restaurant.save();
  }

  /**
   * The compliance-document check applies unconditionally, regardless of caller — the menu-item
   * check (the other approval prerequisite) can't live here since it needs MenuService, and
   * RestaurantsModule importing MenuModule would create a cycle (MenuModule already imports
   * RestaurantsModule) — see AdminService.approveRestaurant, the sole real entry point, which
   * checks that one and then calls this.
   */
  async approve(id: string): Promise<RestaurantDocument> {
    const restaurant = await this.findByIdOrThrow(id);
    if (!restaurant.complianceDocumentUrl) {
      throw new BadRequestException(
        'This restaurant has not uploaded a business registration document yet',
      );
    }
    restaurant.isApproved = true;
    return restaurant.save();
  }

  /**
   * Runs the automated CAC/RC check and stores its result (docs/ROADMAP.md FDP-115) — called
   * once at creation and again from `reverifyBusiness`. Never throws: a Youverify outage or an
   * unconfigured API key both resolve to `businessVerification.status: 'not_attempted'`, which
   * behaves identically to today (falls into the manual admin queue) — this must never turn into
   * a failed registration or a failed re-check request.
   */
  private async runVerification(
    restaurant: RestaurantDocument,
    registrationNumber: string,
    businessName: string,
  ): Promise<void> {
    try {
      const result =
        await this.businessVerificationService.verifyBusinessRegistration(
          registrationNumber,
          businessName,
        );
      if (result.outcome === 'verified') {
        restaurant.businessVerification = {
          status: 'verified',
          providerRegisteredName: result.registeredName,
          providerRegisteredAddress: result.registeredAddress,
          providerRawStatus: result.rawStatus,
          checkedAt: new Date(),
          failureReason: null,
        };
      } else if (result.outcome === 'mismatch') {
        restaurant.businessVerification = {
          status: 'mismatch',
          providerRegisteredName: result.registeredName,
          providerRegisteredAddress: result.registeredAddress,
          providerRawStatus: result.rawStatus,
          checkedAt: new Date(),
          failureReason: result.reason,
        };
      } else {
        restaurant.businessVerification = {
          status: 'not_attempted',
          providerRegisteredName: null,
          providerRegisteredAddress: null,
          providerRawStatus: null,
          checkedAt: null,
          failureReason: result.reason,
        };
      }
      await restaurant.save();

      if (result.outcome === 'verified') {
        await this.notify(
          restaurant,
          'business_verification_passed',
          'Business verified',
          `We automatically verified ${restaurant.name}'s business registration. Add at least one menu item to go live.`,
        );
      } else {
        await this.notify(
          restaurant,
          'business_verification_needs_review',
          'Business pending review',
          `${restaurant.name} is pending manual review by our team before it can go live.`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Business verification failed unexpectedly for ${restaurant._id.toString()}`,
        err,
      );
      // businessVerification stays at its 'not_attempted' schema default — identical to today.
    }
  }

  /**
   * Auto-approval path for a restaurant Youverify already confirmed (docs/ROADMAP.md FDP-115) —
   * reuses `approve()`'s existing compliance-document re-check, so this can never approve a
   * restaurant that lacks one. A no-op if already approved or not auto-verified.
   *
   * Deliberately does NOT itself verify the "at least one menu item" prerequisite
   * AdminService.approveRestaurant otherwise checks manually — RestaurantsModule can't check
   * MenuService for it (same module-cycle reason AdminService's split exists). Callers must only
   * invoke this where that prerequisite is already known to hold by construction — today, that's
   * exactly MenuService.createItem right after a menu item is actually created. Do NOT call this
   * from anywhere that hasn't just proven an item exists (e.g. `reverifyBusiness` deliberately
   * does not call it).
   */
  async autoApproveIfEligible(id: string): Promise<void> {
    const restaurant = await this.findByIdOrThrow(id);
    if (restaurant.isApproved) return;
    if (restaurant.businessVerification.status !== 'verified') return;
    const approved = await this.approve(id);
    await this.notify(
      approved,
      'business_auto_listed',
      'Business now live',
      `${approved.name} is now live in the marketplace.`,
    );
  }

  /**
   * Lets an owner correct a mistyped registration number and re-run the automated check without
   * touching anything else about the restaurant (docs/ROADMAP.md FDP-115) — the on-demand
   * fallback if Youverify mismatched or wasn't configured at creation time.
   */
  async reverifyBusiness(
    id: string,
    requester: AccessTokenPayload,
    registrationNumber: string,
  ): Promise<RestaurantDocument> {
    const restaurant = await this.findByIdOrThrow(id);
    this.assertOwnerOrAdmin(restaurant, requester);
    restaurant.businessRegistrationNumber = registrationNumber;
    // runVerification's own `restaurant.save()` persists this field change together with the
    // new businessVerification result in one write.
    await this.runVerification(restaurant, registrationNumber, restaurant.name);
    // Deliberately does NOT call autoApproveIfEligible here — unlike MenuService.createItem,
    // nothing here proves the "at least one menu item" prerequisite is met (RestaurantsModule
    // can't check MenuService for the same module-cycle reason AdminService.approveRestaurant
    // exists), so a restaurant with zero items must still wait for either its first menu item
    // (which re-runs the check) or a manual admin approval — never auto-listed straight from a
    // re-verify call.
    return this.findByIdOrThrow(id);
  }

  /** Best-effort vendor notification — never allowed to fail the caller (docs/ROADMAP.md
   * FDP-115), same posture as every other side-channel notification in this codebase. */
  private async notify(
    restaurant: RestaurantDocument,
    type:
      | 'business_verification_passed'
      | 'business_verification_needs_review'
      | 'business_auto_listed',
    title: string,
    body: string,
  ): Promise<void> {
    try {
      await this.notificationsService.notify({
        userId: restaurant.ownerId.toString(),
        type,
        title,
        body,
      });
    } catch (err) {
      this.logger.error(
        `Notification (${type}) for restaurant ${restaurant._id.toString()} failed`,
        err,
      );
    }
  }

  /**
   * Vendor payouts epic (docs/ROADMAP.md FDP-51 onward) — upserts the one payout-account entry
   * for `provider` (a restaurant has at most one per provider). Called once a provider-specific
   * onboarding flow (e.g. PaystackAdapter's subaccount creation, FDP-52) has actually produced a
   * real account reference; never called with a fabricated reference.
   */
  async setPayoutAccount(
    id: string,
    requester: AccessTokenPayload,
    provider: PaymentProvider,
    status: PayoutAccountStatus,
    reference: string,
    bankDetails?: { bankCode: string; accountNumber: string },
  ): Promise<RestaurantDocument> {
    const restaurant = await this.findByIdOrThrow(id);
    this.assertOwnerOrAdmin(restaurant, requester);
    return this.applyPayoutAccountUpdate(
      { _id: id },
      provider,
      status,
      reference,
      bankDetails,
    );
  }

  /**
   * Same upsert as `setPayoutAccount`, but for a caller with no requester at all — Stripe
   * Connect's `account.updated` webhook (docs/ROADMAP.md FDP-54) is the only thing that flips a
   * Stripe payout account from `pending` to `active`, and a webhook has no authenticated user to
   * check ownership against. Authenticity here comes entirely from the webhook's own signature
   * verification (`StripeAdapter.parseAccountWebhookEvent`), not `assertOwnerOrAdmin` — never
   * call this from a user-facing route.
   */
  async setPayoutAccountFromWebhook(
    id: string,
    provider: PaymentProvider,
    status: PayoutAccountStatus,
    reference: string,
  ): Promise<RestaurantDocument> {
    await this.findByIdOrThrow(id);
    return this.applyPayoutAccountUpdate(
      { _id: id },
      provider,
      status,
      reference,
      undefined,
    );
  }

  /** A restaurant has at most one payout account per provider — looked up by its account
   * reference for Stripe Connect's `account.updated` webhook (FDP-54), which identifies the
   * account by id but not by which restaurant it belongs to. */
  findByPayoutAccountReference(
    provider: PaymentProvider,
    reference: string,
  ): Promise<RestaurantDocument | null> {
    return this.restaurantModel
      .findOne({ payoutAccounts: { $elemMatch: { provider, reference } } })
      .exec();
  }

  /**
   * Atomic, targeted update (`findOneAndUpdate` with `$set`/`$push` on just the
   * `payoutAccounts` path) rather than load-mutate-`.save()` (docs/ROADMAP.md FDP-112) — a real
   * production bug found via the identical rider-side code path: `.save()` revalidates the
   * *entire* document against every required field the schema has, so a restaurant/store with
   * any unrelated pre-existing data issue would get an opaque 500 connecting a payout account, a
   * change that touches none of those other fields. Two sequential `findOneAndUpdate` calls, not
   * one — MongoDB rejects `$set`/`$push` on overlapping array paths in a single update (the same
   * "path conflict" class `VendorMessagesService` already hit for `$inc`/`$setOnInsert`) — so
   * "does an entry for this provider already exist" has to be two round trips, acceptable given
   * this is a low-frequency, self-service, non-concurrent write. The second query's "no existing
   * entry for this provider" filter is `payoutAccounts: { $not: { $elemMatch: { provider } } }`,
   * not the more obvious `'payoutAccounts.provider': { $ne: provider }` — confirmed live
   * (`RidersService`'s identical fix) that the dotted-path form does not reliably match when
   * `payoutAccounts` is empty, the realistic case for a first-ever payout account.
   */
  private async applyPayoutAccountUpdate(
    filter: QueryFilter<RestaurantDocument>,
    provider: PaymentProvider,
    status: PayoutAccountStatus,
    reference: string,
    bankDetails: { bankCode: string; accountNumber: string } | undefined,
  ): Promise<RestaurantDocument> {
    const bankCode = bankDetails?.bankCode ?? null;
    const accountNumber = bankDetails?.accountNumber ?? null;

    const updatedExisting = await this.restaurantModel
      .findOneAndUpdate(
        { ...filter, 'payoutAccounts.provider': provider },
        {
          $set: {
            'payoutAccounts.$.status': status,
            'payoutAccounts.$.reference': reference,
            'payoutAccounts.$.bankCode': bankCode,
            'payoutAccounts.$.accountNumber': accountNumber,
          },
        },
        { new: true },
      )
      .exec();
    if (updatedExisting) return updatedExisting;

    const withNewEntry = await this.restaurantModel
      .findOneAndUpdate(
        { ...filter, payoutAccounts: { $not: { $elemMatch: { provider } } } },
        {
          $push: {
            payoutAccounts: {
              provider,
              status,
              reference,
              bankCode,
              accountNumber,
            },
          },
        },
        { new: true },
      )
      .exec();
    if (!withNewEntry) throw new NotFoundException('Restaurant not found');
    return withNewEntry;
  }

  /** Called by ReviewsService after a review is created/changed — recomputed from scratch each
   * time rather than incrementally updated, since review volume here is low enough that a full
   * aggregate is simpler and can't drift out of sync (docs/ROADMAP.md FDP-18). */
  async updateRatingStats(
    restaurantId: string,
    avgRating: number,
    reviewCount: number,
  ): Promise<void> {
    await this.restaurantModel
      .updateOne({ _id: restaurantId }, { avgRating, reviewCount })
      .exec();
  }

  /** Throws unless the requester owns this restaurant or is a platform admin. */
  assertOwnerOrAdmin(
    restaurant: RestaurantDocument,
    requester: AccessTokenPayload,
  ): void {
    if (requester.role === 'admin') return;
    if (restaurant.ownerId.toString() !== requester.sub) {
      throw new ForbiddenException(
        'You do not have permission to modify this restaurant',
      );
    }
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'restaurant';
    let slug = base;
    let suffix = 0;

    while (await this.restaurantModel.exists({ slug })) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
    return slug;
  }
}
