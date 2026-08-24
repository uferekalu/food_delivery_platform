import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PromoCode, PromoCodeDocument } from './schemas/promo-code.schema';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';

export type PromoCodeValidation =
  | { valid: true; promoCodeId: string; discountAmount: number }
  | { valid: false; reason: string };

@Injectable()
export class PromoCodesService {
  constructor(
    @InjectModel(PromoCode.name)
    private readonly promoCodeModel: Model<PromoCodeDocument>,
  ) {}

  create(dto: CreatePromoCodeDto): Promise<PromoCodeDocument> {
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
    Object.assign(promo, dto);
    return promo.save();
  }

  /** Read-only — does not increment `usedCount`. Order creation calls `redeem()` separately,
   * only once the order the discount actually applies to has been created. */
  async validate(
    code: string,
    restaurantId: string,
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
    if (promo.restaurantId && promo.restaurantId.toString() !== restaurantId) {
      return {
        valid: false,
        reason: 'This promo code is not valid for this restaurant',
      };
    }
    if (subtotal < promo.minOrderAmount) {
      return {
        valid: false,
        reason: `This promo code requires a minimum order of ${promo.minOrderAmount.toFixed(2)}`,
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
