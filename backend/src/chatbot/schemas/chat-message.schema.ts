import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Support chat widget (docs/ROADMAP.md FDP-106) — a flat, append-only log of every exchange
 * (both a confident KB match and a fallback-to-ticket), purely so `GET /chatbot/history` has
 * something to return when a visitor reloads mid-conversation. Deliberately not a richer
 * "conversation" model with threading/context — this widget answers one question at a time
 * against a keyword-matched knowledge base, it doesn't hold a multi-turn dialogue state.
 */
@Schema({ timestamps: true })
export class ChatMessage {
  @Prop({ type: String, default: null, index: true })
  userId: string | null;

  @Prop({ type: String, default: null, index: true })
  sessionId: string | null;

  @Prop({ type: String, required: true, trim: true })
  message: string;

  @Prop({ type: String, required: true })
  answer: string;

  @Prop({ type: Boolean, required: true })
  matched: boolean;
}

export type ChatMessageDocument = HydratedDocument<ChatMessage>;
export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);
