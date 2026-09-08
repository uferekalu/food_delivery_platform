import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { VendorMessageSenderRole } from './vendor-message.schema';

/**
 * One inbox-row summary per vendor (docs/ROADMAP.md FDP-108), upserted alongside every
 * `VendorMessage` write — kept as a separate lightweight document rather than aggregating
 * `VendorMessage` on every list request, the same "one summary row, updated on write" shape
 * `Payout`/`PayoutClawback` use elsewhere in this codebase for read-heavy admin lists.
 * `unreadByAdmin`/`unreadByVendor` are simple counters reset to 0 by the corresponding
 * mark-as-read endpoint, not per-message read receipts — this is a two-party thread, not a
 * multi-recipient notification list, so per-message granularity buys nothing.
 */
@Schema({ timestamps: true })
export class VendorConversation {
  @Prop({ type: String, required: true, unique: true, index: true })
  vendorId: string;

  @Prop({ type: Date, required: true })
  lastMessageAt: Date;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  lastMessagePreview: string;

  @Prop({ type: String, enum: ['admin', 'restaurant_owner'], required: true })
  lastSenderRole: VendorMessageSenderRole;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  unreadByAdmin: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  unreadByVendor: number;
}

export type VendorConversationDocument = HydratedDocument<VendorConversation>;
export const VendorConversationSchema =
  SchemaFactory.createForClass(VendorConversation);
