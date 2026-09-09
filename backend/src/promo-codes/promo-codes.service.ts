import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PromoCode, PromoCodeDocument } from './schemas/promo-code.schema';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StoresService } from '../stores/stores.service';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';

export type PromoCodeSeller =
  | { sellerType: 'restaurant'; sellerId: string }
  | { sellerType: 'store'; sellerId: string };

export type PromoCodeValidation =
  | { valid: true; promoCodeId: string; discountAmount: number }
  // `minOrderAmount` is only set for the min-order-not-met case — this service has no currency
  // in scope to format it with (it never loads the restaurant/store document), so `reason` stays
  // a plain sentence for every other rejection, and the frontend builds its own currency-aware
  // message for this one case using the cart's own currency instead of embedding a bare number.
  | { valid: false; reason: string; minOrderAmount?: number };

@Injectable()
export class PromoCodesService {
  constructor(
    @InjectModel(PromoCode.name)
    private readonly promoCodeModel: Model<PromoCodeDocument>,
    private readonly restaurantsService: RestaurantsService,
    private readonly storesService: StoresService,
  ) {}

  /**
   * Vendor-created promo codes (docs/ROADMAP.md FDP-111) — an admin may still create a
   * platform-wide code (neither `restaurantId` nor `storeId` set) or one scoped to any
   * restaurant/store, same as before. A `restaurant_owner` may only create a code scoped to a
   * restaurant/store they actually own — never platform-wide, and never for someone else's
   * business — enforced via `assertSellerOwnership` below, which reuses the exact
   * `assertOwnerOrAdmin` ownership check every other vendor-facing mutation in this codebase
   * already goes through.
   *
   * `async` deliberately, not a plain function returning `this.promoCodeModel.create(dto)` —
   * assertAtMostOneSeller's throw needs to surface as a rejected promise (what every caller,
   * and `.rejects.toThrow()` in tests, expects from this method), not a synchronous throw before
   * any promise is even returned.
   */
  async create(
    dto: CreatePromoCodeDto,
    requester: AccessTokenPayload,
  ): Promise<PromoCodeDocument> {
    this.assertAtMostOneSeller(dto);
    if (requester.role !== 'admin') {
      if (!dto.restaurantId && !dto.storeId) {
        throw new ForbiddenException(
          'You can only create a promo code scoped to your own restaurant or store',
        );
      }
      await this.assertSellerOwnership(dto, requester);
    }
    return this.promoCodeModel.create(dto);
  }

  findAll(): Promise<PromoCodeDocument[]> {
    return this.promoCodeModel.find().sort({ createdAt: -1 }).exec();
  }

  /** A vendor's own promo codes — every code scoped to any restaurant or store they own, across
   * both seller types (docs/ROADMAP.md FDP-111). Never includes platform-wide codes (those are
   * admin's alone) or another vendor's codes. */
  async findMine(requester: AccessTokenPayload): Promise<PromoCodeDocument[]> {
    const [restaurants, stores] = await Promise.all([
      this.restaurantsService.findMine(requester.sub),
      this.storesService.findMine(requester.sub),
    ]);
    const restaurantIds = restaurants.map((r) => r._id.toString());
    const storeIds = stores.map((s) => s._id.toString());
    if (restaurantIds.length === 0 && storeIds.length === 0) return [];

    return this.promoCodeModel
      .find({
        $or: [
          { restaurantId: { $in: restaurantIds } },
          { storeId: { $in: storeIds } },
        ],
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async update(
    id: string,
    dto: UpdatePromoCodeDto,
    requester: AccessTokenPayload,
  ): Promise<PromoCodeDocument> {
    const promo = await this.promoCodeModel.findById(id).exec();
    if (!promo) throw new NotFoundException('Promo code not found');

    if (requester.role !== 'admin') {
      // A vendor may only manage a code already scoped to their own business, and may never
      // reassign it to a different restaurant/store or make it platform-wide — that's an
      // admin-only action, since it changes who the code belongs to.
      if (dto.restaurantId !== undefined || dto.storeId !== undefined) {
        throw new ForbiddenException(
          'Only an admin can change which restaurant or store a promo code belongs to',
        );
      }
      await this.assertSellerOwnership(
        {
          restaurantId: promo.restaurantId?.toString(),
          storeId: promo.storeId?.toString(),
        },
        requester,
      );
    }

    this.assertAtMostOneSeller({
      restaurantId: dto.restaurantId ?? promo.restaurantId?.toString(),
      storeId: dto.storeId ?? promo.storeId?.toString(),
    });
    Object.assign(promo, dto);
    return promo.save();
  }

  private async assertSellerOwnership(
    seller: { restaurantId?: string; storeId?: string },
    requester: AccessTokenPayload,
  ): Promise<void> {
    if (seller.restaurantId) {
      const restaurant = await this.restaurantsService.findByIdOrThrow(
        seller.restaurantId,
      );
      this.restaurantsService.assertOwnerOrAdmin(restaurant, requester);
    } else if (seller.storeId) {
      const store = await this.storesService.findByIdOrThrow(seller.storeId);
      this.storesService.assertOwnerOrAdmin(store, requester);
    }
  }

  /** At most one of restaurantId/storeId — a promo code is platform-wide (neither set),
   * restaurant-scoped, or store-scoped, never both (docs/ROADMAP.md FDP-90). */
  private assertAtMostOneSeller(input: {
    restaurantId?: string;
    storeId?: string;
  }): void {
    if (input.restaurantId && input.storeId) {
      throw new BadRequestException(
        'A promo code can be scoped to a restaurant or a store, not both',
      );
    }
  }

  /** Read-only — does not increment `usedCount`. Order creation calls `redeem()` separately,
   * only once the order the discount actually applies to has been created. Accepts either a
   * restaurant or a store cart (docs/ROADMAP.md FDP-90) — a promo scoped to the other seller
   * type, or to a specific restaurant/store the cart doesn't belong to, is rejected the same way
   * either direction. */
  async validate(
    code: string,
    seller: PromoCodeSeller,
    subtotal: number,
  ): Promise<PromoCodeValidation> {
    const promo = await this.promoCodeModel
      .findOne({ code: code.toUpperCase().trim() })
      .exec();

    if (!promo) return { valid: false, reason: 'Invalid promo code' };
    if (!promo.isActive)
      return { valid: false, reason: 'This promo code is no longer active' };
    if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
      return { valid: false, reason: 'This promo code has expired' };
    }
    if (promo.restaurantId !== null) {
      const validForThisCart =
        seller.sellerType === 'restaurant' &&
        promo.restaurantId.toString() === seller.sellerId;
      if (!validForThisCart) {
        return {
          valid: false,
          reason: 'This promo code is not valid for this restaurant',
        };
      }
    }
    if (promo.storeId !== null) {
      const validForThisCart =
        seller.sellerType === 'store' &&
        promo.storeId.toString() === seller.sellerId;
      if (!validForThisCart) {
        return {
          valid: false,
          reason: 'This promo code is not valid for this store',
        };
      }
    }
    if (subtotal < promo.minOrderAmount) {
      return {
        valid: false,
        reason: 'This promo code requires a higher minimum order',
        minOrderAmount: promo.minOrderAmount,
      };
    }
    if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
      return {
        valid: false,
        reason: 'This promo code has reached its usage limit',
      };
    }

    const rawDiscount =
      promo.discountType === 'percentage'
        ? (subtotal * promo.discountValue) / 100
        : promo.discountValue;
    const discountAmount = Math.min(
      rawDiscount,
      promo.maxDiscountAmount ?? rawDiscount,
      subtotal,
    );

    return { valid: true, promoCodeId: promo._id.toString(), discountAmount };
  }

  /**
   * Atomic check-and-increment (docs/ROADMAP.md FDP-109) — `validate()` reading `usedCount <
   * usageLimit` and this method's `$inc` happening later, non-atomically, meant two concurrent
   * orders could both pass validation while the code had exactly one redemption left and both
   * redeem it, pushing `usedCount` past `usageLimit`. The `$expr` condition folds the same check
   * into the update itself, so only a request that's still genuinely under the limit at the
   * moment it actually writes can increment it — `usedCount` can never exceed `usageLimit` in the
   * database regardless of how many requests race here. Returns whether this specific call
   * actually redeemed it (false = the limit was already reached by a concurrent request) — not
   * currently acted on by the caller (the order this redemption belongs to is already created by
   * the time this runs), logged so a real occurrence is at least visible.
   */
  async redeem(promoCodeId: string): Promise<boolean> {
    const result = await this.promoCodeModel
      .updateOne(
        {
          _id: promoCodeId,
          $expr: {
            $or: [
              { $eq: ['$usageLimit', null] },
              { $lt: ['$usedCount', '$usageLimit'] },
            ],
          },
        },
        { $inc: { usedCount: 1 } },
      )
      .exec();
    return result.modifiedCount > 0;
  }
}
