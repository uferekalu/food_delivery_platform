import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const DISCOUNT_TYPES = ['percentage', 'fixed'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

@Schema({ timestamps: true })
export class PromoCode {
  @Prop({
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  })
  code: string;

  @Prop({ type: String, enum: DISCOUNT_TYPES, required: true })
  discountType: DiscountType;

  // Percentage points (0-100) if discountType is 'percentage', or a flat amount in the order's
  // currency if 'fixed'.
  @Prop({ type: Number, required: true, min: 0 })
  discountValue: number;

  @Prop({ type: Number, default: 0, min: 0 })
  minOrderAmount: number;

  // Caps how much a percentage discount can actually knock off — irrelevant for 'fixed'.
  @Prop({ type: Number, default: null })
  maxDiscountAmount: number | null;

  // `null` = platform-wide; scoped to one restaurant otherwise. At most one of
  // restaurantId/storeId is ever set (docs/ROADMAP.md FDP-90) — enforced in
  // CreatePromoCodeDto/UpdatePromoCodeDto, not here, since Mongoose validators don't see
  // sibling fields easily.
  @Prop({ type: Types.ObjectId, ref: 'Restaurant', default: null, index: true })
  restaurantId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Store', default: null, index: true })
  storeId: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Number, default: null })
  usageLimit: number | null;

  @Prop({ type: Number, default: 0 })
  usedCount: number;
}

export type PromoCodeDocument = HydratedDocument<PromoCode>;
export const PromoCodeSchema = SchemaFactory.createForClass(PromoCode);
