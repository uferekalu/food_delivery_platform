import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Support chat widget (docs/ROADMAP.md FDP-106) — a curated FAQ entry the chatbot matches
 * against, deliberately a plain keyword-scored lookup table rather than an embedding/AI-backed
 * search: this is a scoped support tool with a hard fallback to a human, not a general assistant,
 * and a keyword table is something an admin can read, predict, and tune without any external
 * dependency or cost.
 *
 * `keywords` are matched as substrings against the visitor's lowercased, punctuation-stripped
 * message (see `KnowledgeBaseService.match`) — a keyword can be a multi-word phrase ("delivery
 * fee") for more specific, higher-weighted matches, not just single words. `question` is the
 * canonical phrasing shown back to an admin managing entries (never shown to the visitor — the
 * `answer` is), so an admin can tell entries apart at a glance without reading every keyword.
 */
@Schema({ timestamps: true })
export class KnowledgeBaseEntry {
  @Prop({ type: String, required: true, trim: true })
  question: string;

  @Prop({ type: String, required: true, trim: true })
  answer: string;

  @Prop({ type: [String], required: true })
  keywords: string[];

  @Prop({ type: String, required: true, trim: true })
  category: string;

  // A soft-delete flag rather than hard deletion by default from the admin UI — matches
  // PromoCode's own "isActive toggle, not delete" convention (an entry that stops matching but
  // keeps its history is safer to get wrong than one that's gone entirely). A real DELETE
  // endpoint still exists for genuinely removing a mistaken entry.
  @Prop({ type: Boolean, required: true, default: true })
  isActive: boolean;
}

export type KnowledgeBaseEntryDocument = HydratedDocument<KnowledgeBaseEntry>;
export const KnowledgeBaseEntrySchema =
  SchemaFactory.createForClass(KnowledgeBaseEntry);
