import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ChatMessage,
  ChatMessageDocument,
} from './schemas/chat-message.schema';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { SupportTicketsService } from '../support-tickets/support-tickets.service';
import type { ChatIdentity } from '../support-tickets/chat-identity';
import { AskChatbotDto } from './dto/ask-chatbot.dto';
import { LlmChatService } from './llm-chat.service';

// Support chat widget (docs/ROADMAP.md FDP-106) — the widget's own explicit design constraint:
// "not a general-purpose AI assistant... a scoped support tool with a hard fallback to human
// escalation." This is the one sentence a visitor sees whenever neither the LLM (docs/ROADMAP.md
// FDP-110) nor the deterministic keyword matcher it falls back on can confidently answer — warm,
// honest about the handoff, never pretends to have an answer it doesn't.
export const CHATBOT_FALLBACK_MESSAGE =
  "I don't have a confident answer for that yet, but I've passed your question on to our support team — they'll follow up soon.";

export interface AskChatbotResult {
  answer: string;
  matched: boolean;
  ticketId?: string;
}

@Injectable()
export class ChatbotService {
  constructor(
    @InjectModel(ChatMessage.name)
    private readonly chatMessageModel: Model<ChatMessageDocument>,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly supportTicketsService: SupportTicketsService,
    private readonly llmChatService: LlmChatService,
  ) {}

  /**
   * Three-tier fallback chain (docs/ROADMAP.md FDP-110): the LLM (grounded in the full active
   * knowledge base) is tried first when configured, since it can hold a natural conversation —
   * including a plain "hi" — instead of the deterministic matcher's all-or-nothing keyword
   * score. `keywordMatch` is still computed unconditionally, both as the fallback when the LLM
   * is unconfigured/errors, and to attach `matchedEntryId` (the closest keyword hit, if any) to
   * an escalated ticket as admin context either way.
   */
  async ask(
    identity: ChatIdentity,
    dto: AskChatbotDto,
  ): Promise<AskChatbotResult> {
    const keywordMatch = await this.knowledgeBaseService.match(dto.message);
    const llmResult = this.llmChatService.isConfigured
      ? await this.llmChatService.answer(
          dto.message,
          await this.knowledgeBaseService.findActiveForGrounding(),
        )
      : null;

    let answer: string;
    let matched: boolean;

    if (llmResult) {
      answer = llmResult.answer;
      matched = llmResult.confident;
    } else if (keywordMatch?.aboveThreshold) {
      answer = keywordMatch.entry.answer;
      matched = true;
    } else {
      answer = CHATBOT_FALLBACK_MESSAGE;
      matched = false;
    }

    let ticketId: string | undefined;
    if (!matched) {
      const ticket = await this.supportTicketsService.create(
        dto.message,
        identity,
        keywordMatch ? keywordMatch.entry._id.toString() : null,
      );
      ticketId = ticket._id.toString();
    }

    await this.chatMessageModel.create({
      userId: identity.userId,
      sessionId: identity.sessionId,
      message: dto.message,
      answer,
      matched,
    });

    return { answer, matched, ticketId };
  }

  history(identity: ChatIdentity): Promise<ChatMessageDocument[]> {
    const filter = identity.userId
      ? { userId: identity.userId }
      : { sessionId: identity.sessionId };
    return this.chatMessageModel.find(filter).sort({ createdAt: 1 }).exec();
  }
}
