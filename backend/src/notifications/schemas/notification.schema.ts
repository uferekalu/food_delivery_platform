import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const NOTIFICATION_CHANNELS = ['inapp', 'email', 'sms'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = [
  'order_placed',
  'order_status',
  'new_order',
  'payment_failed',
  'payout_account_changed',
  'payout_succeeded',
  'payout_failed',
  'payout_reconciliation_needed',
  'refund_clawback_created',
  'refund_reconciliation_needed',
  'order_refunded_externally',
  'order_dispute_flagged',
  'support_ticket_created',
  'new_vendor_message',
  'new_admin_message',
  // Automated business verification (docs/ROADMAP.md FDP-115).
  'business_verification_passed',
  'business_verification_needs_review',
  'business_auto_listed',
  // Sponsored-listing ad campaigns (docs/ROADMAP.md FDP-124).
  'ad_campaign_created',
  'ad_campaign_payment_failed',
  'ad_campaign_active',
  'ad_campaign_ended',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// `minimize: false` — a real production bug (docs/ROADMAP.md FDP-127): Mongoose's default
// `minimize: true` strips any empty-object field (`{}`) entirely before persisting AND again
// before serializing a document to JSON, so the vast majority of notifications (any type that
// never sets `metadata`, e.g. `business_verification_needs_review` or `ad_campaign_created`) came
// back from `GET /notifications` with the `metadata` key missing outright, not present as `{}`
// — contradicting its own `Record<string, unknown>` type (required, not optional) on both sides
// of the API. The frontend's `NotificationRow`/`NotificationCard` read
// `notification.metadata.orderId` without a guard, trusting that contract, and crashed the whole
// page with "Cannot read properties of undefined (reading 'orderId')" the moment a user opened
// any notification whose metadata had been silently minimized away. `minimize: false` keeps
// `metadata: {}` in both the stored document and every serialized response, so the field is
// truthfully always an object, never absent.
@Schema({ timestamps: true, minimize: false })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: NOTIFICATION_TYPES, required: true })
  type: NotificationType;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 1000 })
  body: string;

  @Prop({ default: false, index: true })
  isRead: boolean;

  // Every notification always gets an `inapp` row (this document *is* that row) — `email`/`sms`
  // are appended when NotificationsService.notify() actually attempted that side channel, so
  // the frontend bell can show "also sent by email" without a separate email-history table.
  @Prop({ type: [String], enum: NOTIFICATION_CHANNELS, default: ['inapp'] })
  channels: NotificationChannel[];

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, createdAt: -1 });
