import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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
  constructor(
    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
  ) {}

  async create(
    ownerId: string,
    dto: CreateRestaurantDto,
  ): Promise<RestaurantDocument> {
    const slug = await this.generateUniqueSlug(dto.name);
    return this.restaurantModel.create({
      ...dto,
      ownerId,
      slug,
      // "Near me" (docs/ROADMAP.md FDP-96) — see toGeoPoint's doc comment.
      address: {
        ...dto.address,
        location: toGeoPoint(dto.address.lat, dto.address.lng),
      },
    });
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
    Object.assign(restaurant, dto);
    // "Near me" (docs/ROADMAP.md FDP-96) — re-derived whenever the address itself changes (an
    // owner correcting a typo'd coordinate must also correct where the geospatial index thinks
    // they are), left untouched otherwise since `dto.address` is optional on a partial update.
    if (dto.address) {
      restaurant.address.location = toGeoPoint(dto.address.lat, dto.address.lng);
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
      restaurant,
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
    const restaurant = await this.findByIdOrThrow(id);
    return this.applyPayoutAccountUpdate(
      restaurant,
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

  private applyPayoutAccountUpdate(
    restaurant: RestaurantDocument,
    provider: PaymentProvider,
    status: PayoutAccountStatus,
    reference: string,
    bankDetails: { bankCode: string; accountNumber: string } | undefined,
  ): Promise<RestaurantDocument> {
    const bankCode = bankDetails?.bankCode ?? null;
    const accountNumber = bankDetails?.accountNumber ?? null;
    const existing = restaurant.payoutAccounts.find(
      (account) => account.provider === provider,
    );
    if (existing) {
      existing.status = status;
      existing.reference = reference;
      existing.bankCode = bankCode;
      existing.accountNumber = accountNumber;
    } else {
      restaurant.payoutAccounts.push({
        provider,
        status,
        reference,
        bankCode,
        accountNumber,
      });
    }
    return restaurant.save();
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
