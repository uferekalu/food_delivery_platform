import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// The browser's `PushSubscriptionKeys` shape (`pushManager.subscribe()`'s return value, JSON-
// serialized) — required for `web-push` to encrypt a payload for this specific subscription.
@Schema({ _id: false })
export class PushSubscriptionKeys {
  @Prop({ type: String, required: true })
  p256dh: string;

  @Prop({ type: String, required: true })
  auth: string;
}
export const PushSubscriptionKeysSchema =
  SchemaFactory.createForClass(PushSubscriptionKeys);

/**
 * Web push notifications (docs/ROADMAP.md FDP-100) — one document per browser/device a user has
 * ever enabled push on, not one per user (unlike `User.phone` for SMS): a customer can have the
 * feature on across a work laptop, a home laptop, and a phone browser simultaneously, each with
 * its own `endpoint`. `endpoint` (not `userId`) is the natural dedup key — a browser calling
 * `pushManager.subscribe()` again for the same registration returns the same endpoint, so
 * `PushService.subscribe()` upserts on it rather than accumulating duplicate rows.
 */
@Schema({ timestamps: true })
export class PushSubscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, unique: true })
  endpoint: string;

  @Prop({ type: PushSubscriptionKeysSchema, required: true })
  keys: PushSubscriptionKeys;
}

export type PushSubscriptionDocument = HydratedDocument<PushSubscription>;
export const PushSubscriptionSchema =
  SchemaFactory.createForClass(PushSubscription);
