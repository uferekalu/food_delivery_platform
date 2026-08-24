import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const REVIEW_TARGET_TYPES = ['restaurant', 'rider'] as const;
export type ReviewTargetType = (typeof REVIEW_TARGET_TYPES)[number];

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: String, enum: REVIEW_TARGET_TYPES, required: true })
  targetType: ReviewTargetType;

  // A Restaurant._id or a rider's User._id (Order.riderId's own convention) depending on
  // targetType — never client-supplied, always derived server-side from the reviewed order
  // (see ReviewsService.create) so a customer can't review a target unrelated to their order.
  @Prop({ type: Types.ObjectId, required: true, index: true })
  targetId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ type: String, default: '', trim: true, maxlength: 1000 })
  comment: string;

  @Prop({ type: [String], default: [] })
  images: string[];
}

export type ReviewDocument = HydratedDocument<Review>;
export const ReviewSchema = SchemaFactory.createForClass(Review);
// One review per order per target type — a customer reviews the restaurant and the rider on a
// given order at most once each, not repeatedly.
ReviewSchema.index({ orderId: 1, targetType: 1 }, { unique: true });
ReviewSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
