import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const VENDOR_MESSAGE_SENDER_ROLES = [
  'admin',
  'restaurant_owner',
] as const;
export type VendorMessageSenderRole =
  (typeof VENDOR_MESSAGE_SENDER_ROLES)[number];

/**
 * Admin<->vendor messaging (docs/ROADMAP.md FDP-108) — a real two-way conversation thread, unlike
 * this codebase's two earlier "chat" precedents (`support-tickets`, a single escalated question
 * with no reply field; `chatbot`'s flat non-threaded Q&A log). One thread per vendor user
 * (`vendorId`), not per admin — any admin can view/reply to any vendor's thread, mirroring how
 * `support-tickets` are worked by "admin" as a role rather than a specific admin. `vendorId`/
 * `senderId` are plain strings, never `Types.ObjectId`, matching backend/CLAUDE.md's Mongoose 9
 * ObjectId-cast gotcha — every ref-like id in this codebase is threaded through as a string.
 */
@Schema({ timestamps: true })
export class VendorMessage {
  @Prop({ type: String, required: true, index: true })
  vendorId: string;

  @Prop({ type: String, required: true })
  senderId: string;

  @Prop({ type: String, enum: VENDOR_MESSAGE_SENDER_ROLES, required: true })
  senderRole: VendorMessageSenderRole;

  @Prop({ type: String, required: true, trim: true, maxlength: 2000 })
  body: string;
}

export type VendorMessageDocument = HydratedDocument<VendorMessage>;
export const VendorMessageSchema = SchemaFactory.createForClass(VendorMessage);
VendorMessageSchema.index({ vendorId: 1, createdAt: 1 });
