import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PromoCode, PromoCodeDocument } from './schemas/promo-code.schema';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';

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
  ) {}

  // `async` deliberately, not a plain function returning `this.promoCodeModel.create(dto)` —
  // assertAtMostOneSeller's throw needs to surface as a rejected promise (what every caller,
  // and `.rejects.toThrow()` in tests, expects from this method), not a synchronous throw before
  // any promise is even returned.
  async create(dto: CreatePromoCodeDto): Promise<PromoCodeDocument> {
    this.assertAtMostOneSeller(dto);
    return this.promoCodeModel.create(dto);
  }

  findAll(): Promise<PromoCodeDocument[]> {
    return this.promoCodeModel.find().sort({ createdAt: -1 }).exec();
  }

  async update(
    id: string,
    dto: UpdatePromoCodeDto,
  ): Promise<PromoCodeDocument> {
    const promo = await this.promoCodeModel.findById(id).exec();
    if (!promo) throw new NotFoundException('Promo code not found');
    this.assertAtMostOneSeller({
      restaurantId: dto.restaurantId ?? promo.restaurantId?.toString(),
      storeId: dto.storeId ?? promo.storeId?.toString(),
    });
    Object.assign(promo, dto);
    return promo.save();
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

  async redeem(promoCodeId: string): Promise<void> {
    await this.promoCodeModel
      .updateOne({ _id: promoCodeId }, { $inc: { usedCount: 1 } })
      .exec();
  }
}
