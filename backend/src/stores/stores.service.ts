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
import type { PaginatedResult } from '../restaurants/restaurants.service';
import type { PayoutAccountStatus } from '../common/schemas/payout-account.schema';
import type { PaymentProvider } from '../payments/payment-provider';
import { Store, StoreDocument } from './schemas/store.schema';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { ListStoresDto } from './dto/list-stores.dto';
import type { StoreSort } from './dto/list-stores.dto';
import type { NearbyStoresQueryDto } from './dto/nearby-stores-query.dto';

/** A store with its computed distance from the query point, in kilometres (docs/ROADMAP.md
 * FDP-96) — never a stored field, only ever present on `findNearby`'s output. */
export type StoreWithDistance = Store & { distanceKm: number };

const SORT_SPECS: Record<StoreSort, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  rating: { avgRating: -1 },
  // Stores that never set an estimate (`null`) sort last regardless of direction — same
  // reasoning as RestaurantsService.
  delivery_time: { estimatedDeliveryMinutes: 1 },
};

@Injectable()
export class StoresService {
  constructor(
    @InjectModel(Store.name) private readonly storeModel: Model<StoreDocument>,
  ) {}

  async create(ownerId: string, dto: CreateStoreDto): Promise<StoreDocument> {
    const slug = await this.generateUniqueSlug(dto.name);
    return this.storeModel.create({
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
    query: ListStoresDto,
  ): Promise<PaginatedResult<StoreDocument>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const filter: QueryFilter<StoreDocument> = {
      isApproved: true,
      type: query.type,
    };
    if (query.tag) filter.tags = query.tag;
    if (query.search) {
      const pattern = escapeRegExp(query.search.trim());
      filter.name = { $regex: pattern, $options: 'i' };
    }
    if (query.minRating) filter.avgRating = { $gte: query.minRating };
    if (query.maxDeliveryMinutes !== undefined) {
      filter.estimatedDeliveryMinutes = {
        $lte: query.maxDeliveryMinutes,
        $exists: true,
        $ne: null,
      };
    }
    const sort = SORT_SPECS[query.sort ?? 'newest'];
    if (query.sort === 'delivery_time' && !filter.estimatedDeliveryMinutes) {
      filter.estimatedDeliveryMinutes = { $exists: true, $ne: null };
    }

    const [items, total] = await Promise.all([
      this.storeModel
        .find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort(sort)
        .exec(),
      this.storeModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** "Stores near me" (docs/ROADMAP.md FDP-96) — see
   * `RestaurantsService.findNearby`'s doc comment for the full `$geoNear`/`$facet` reasoning,
   * identical here aside from the extra required `type` filter. */
  async findNearby(
    query: NearbyStoresQueryDto,
  ): Promise<PaginatedResult<StoreWithDistance>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const radiusKm = query.radiusKm ?? 10;

    const [result] = await this.storeModel
      .aggregate<{
        items: (StoreWithDistance & { distanceMeters: number })[];
        totalCount: { count: number }[];
      }>([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [query.lng, query.lat] },
            distanceField: 'distanceMeters',
            maxDistance: radiusKm * 1000,
            spherical: true,
            query: { isApproved: true, type: query.type },
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

  /** Public lookup — deliberately requires `isApproved`, same as RestaurantsService.findBySlug. */
  async findBySlug(slug: string): Promise<StoreDocument> {
    const store = await this.storeModel
      .findOne({ slug: slug.toLowerCase(), isApproved: true })
      .exec();
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  /** Admin-only queue of stores awaiting approval — oldest first, same as
   * RestaurantsService.findPendingApproval. */
  findPendingApproval(): Promise<StoreDocument[]> {
    return this.storeModel
      .find({ isApproved: false })
      .sort({ createdAt: 1 })
      .exec();
  }

  async countByApproval(): Promise<{ approved: number; pending: number }> {
    const [approved, pending] = await Promise.all([
      this.storeModel.countDocuments({ isApproved: true }).exec(),
      this.storeModel.countDocuments({ isApproved: false }).exec(),
    ]);
    return { approved, pending };
  }

  findMine(ownerId: string): Promise<StoreDocument[]> {
    return this.storeModel.find({ ownerId }).sort({ createdAt: -1 }).exec();
  }

  async findByIdOrThrow(id: string): Promise<StoreDocument> {
    const store = await this.storeModel.findById(id).exec();
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async update(
    id: string,
    requester: AccessTokenPayload,
    dto: UpdateStoreDto,
  ): Promise<StoreDocument> {
    const store = await this.findByIdOrThrow(id);
    this.assertOwnerOrAdmin(store, requester);
    Object.assign(store, dto);
    // "Near me" (docs/ROADMAP.md FDP-96) — same reasoning as RestaurantsService.update.
    if (dto.address) {
      store.address.location = toGeoPoint(dto.address.lat, dto.address.lng);
    }
    return store.save();
  }

  async toggleOpen(
    id: string,
    requester: AccessTokenPayload,
  ): Promise<StoreDocument> {
    const store = await this.findByIdOrThrow(id);
    this.assertOwnerOrAdmin(store, requester);
    store.isOpen = !store.isOpen;
    return store.save();
  }

  /**
   * The compliance-document check applies unconditionally, regardless of caller — same split as
   * RestaurantsService.approve()/AdminService.approveRestaurant: the other approval prerequisite
   * (at least one product) needs ProductsService, and StoresModule importing ProductsModule
   * would create a cycle (ProductsModule already imports StoresModule), so that check lives on
   * AdminService instead.
   */
  async approve(id: string): Promise<StoreDocument> {
    const store = await this.findByIdOrThrow(id);
    if (!store.complianceDocumentUrl) {
      throw new BadRequestException(
        'This store has not uploaded a business registration document yet',
      );
    }
    store.isApproved = true;
    return store.save();
  }

  async updateRatingStats(
    storeId: string,
    avgRating: number,
    reviewCount: number,
  ): Promise<void> {
    await this.storeModel
      .updateOne({ _id: storeId }, { avgRating, reviewCount })
      .exec();
  }

  /** Throws unless the requester owns this store or is a platform admin. */
  assertOwnerOrAdmin(
    store: StoreDocument,
    requester: AccessTokenPayload,
  ): void {
    if (requester.role === 'admin') return;
    if (store.ownerId.toString() !== requester.sub) {
      throw new ForbiddenException(
        'You do not have permission to modify this store',
      );
    }
  }

  // --- Vendor payouts, extended to stores (docs/ROADMAP.md FDP-94) — mirrors
  // RestaurantsService's equivalent methods exactly; see that file's doc comments for the
  // reasoning behind each parameter (this is the second domain this pattern applies to, but not
  // yet worth extracting into a shared helper — see backend/CLAUDE.md on when to generalize).

  async setPayoutAccount(
    id: string,
    requester: AccessTokenPayload,
    provider: PaymentProvider,
    status: PayoutAccountStatus,
    reference: string,
    bankDetails?: { bankCode: string; accountNumber: string },
  ): Promise<StoreDocument> {
    const store = await this.findByIdOrThrow(id);
    this.assertOwnerOrAdmin(store, requester);
    return this.applyPayoutAccountUpdate(
      store,
      provider,
      status,
      reference,
      bankDetails,
    );
  }

  /** Same upsert as `setPayoutAccount`, but for Stripe Connect's `account.updated` webhook,
   * which has no authenticated user to check ownership against. */
  async setPayoutAccountFromWebhook(
    id: string,
    provider: PaymentProvider,
    status: PayoutAccountStatus,
    reference: string,
  ): Promise<StoreDocument> {
    const store = await this.findByIdOrThrow(id);
    return this.applyPayoutAccountUpdate(
      store,
      provider,
      status,
      reference,
      undefined,
    );
  }

  findByPayoutAccountReference(
    provider: PaymentProvider,
    reference: string,
  ): Promise<StoreDocument | null> {
    return this.storeModel
      .findOne({ payoutAccounts: { $elemMatch: { provider, reference } } })
      .exec();
  }

  private applyPayoutAccountUpdate(
    store: StoreDocument,
    provider: PaymentProvider,
    status: PayoutAccountStatus,
    reference: string,
    bankDetails: { bankCode: string; accountNumber: string } | undefined,
  ): Promise<StoreDocument> {
    const bankCode = bankDetails?.bankCode ?? null;
    const accountNumber = bankDetails?.accountNumber ?? null;
    const existing = store.payoutAccounts.find(
      (account) => account.provider === provider,
    );
    if (existing) {
      existing.status = status;
      existing.reference = reference;
      existing.bankCode = bankCode;
      existing.accountNumber = accountNumber;
    } else {
      store.payoutAccounts.push({
        provider,
        status,
        reference,
        bankCode,
        accountNumber,
      });
    }
    return store.save();
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'store';
    let slug = base;
    let suffix = 0;

    while (await this.storeModel.exists({ slug })) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
    return slug;
  }
}
