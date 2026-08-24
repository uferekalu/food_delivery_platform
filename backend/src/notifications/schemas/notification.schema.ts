import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const NOTIFICATION_CHANNELS = ['inapp', 'email', 'sms'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = [
  'order_placed',
  'order_status',
  'new_order',
  'payment_failed',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

@Schema({ timestamps: true })
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
