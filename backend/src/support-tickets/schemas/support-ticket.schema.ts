import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const SUPPORT_TICKET_STATUSES = ['open', 'resolved'] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

/**
 * Support chat widget (docs/ROADMAP.md FDP-106) — created automatically by `ChatbotService`
 * whenever a visitor's question doesn't confidently match a `KnowledgeBaseEntry`, the hard
 * fallback the widget is built around ("not a general-purpose AI assistant... a scoped support
 * tool with a hard fallback to human escalation"). An admin resolves it by hand; nothing in this
 * codebase auto-closes one.
 *
 * Exactly one of `userId`/`sessionId` is set — a logged-in visitor is identified by their real
 * account, a guest by a client-generated session id (see `frontend/src/lib/chat-session.ts`) —
 * the same "exactly one of these two is set" shape `Order.restaurantId`/`storeId` already uses
 * for its own either/or seller reference.
 */
@Schema({ timestamps: true })
export class SupportTicket {
  @Prop({ type: String, required: true, trim: true })
  question: string;

  @Prop({ type: String, default: null, index: true })
  userId: string | null;

  @Prop({ type: String, default: null, index: true })
  sessionId: string | null;

  /** The closest-scoring `KnowledgeBaseEntry` at the time this ticket was created, even though
   * it fell below `MATCH_CONFIDENCE_THRESHOLD` — `null` only when there were no active entries
   * at all to compare against. Purely admin context ("the bot almost matched this one, maybe its
   * keywords need broadening") — never used to auto-answer anything. */
  @Prop({ type: String, default: null })
  matchedEntryId: string | null;

  @Prop({
    type: String,
    enum: SUPPORT_TICKET_STATUSES,
    required: true,
    default: 'open',
    index: true,
  })
  status: SupportTicketStatus;

  @Prop({ type: Date, default: null })
  resolvedAt: Date | null;

  @Prop({ type: String, default: null })
  resolvedBy: string | null;
}

export type SupportTicketDocument = HydratedDocument<SupportTicket>;
export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);
