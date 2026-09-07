import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatMessage, ChatMessageDocument } from './schemas/chat-message.schema';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { SupportTicketsService } from '../support-tickets/support-tickets.service';
import type { ChatIdentity } from '../support-tickets/chat-identity';
import { AskChatbotDto } from './dto/ask-chatbot.dto';

// Support chat widget (docs/ROADMAP.md FDP-106) — the widget's own explicit design constraint:
// "not a general-purpose AI assistant... a scoped support tool with a hard fallback to human
// escalation." This is the one sentence a visitor sees whenever the knowledge base can't
// confidently answer — warm, honest about the handoff, never pretends to have an answer it
// doesn't.
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
  ) {}

  async ask(
    identity: ChatIdentity,
    dto: AskChatbotDto,
  ): Promise<AskChatbotResult> {
    const result = await this.knowledgeBaseService.match(dto.message);

    let answer: string;
    let matched: boolean;
    let ticketId: string | undefined;

    if (result?.aboveThreshold) {
      answer = result.entry.answer;
      matched = true;
    } else {
      answer = CHATBOT_FALLBACK_MESSAGE;
      matched = false;
      const ticket = await this.supportTicketsService.create(
        dto.message,
        identity,
        result ? result.entry._id.toString() : null,
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
