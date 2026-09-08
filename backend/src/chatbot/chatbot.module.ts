import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatMessage, ChatMessageSchema } from './schemas/chat-message.schema';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { LlmChatService } from './llm-chat.service';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { SupportTicketsModule } from '../support-tickets/support-tickets.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatMessage.name, schema: ChatMessageSchema },
    ]),
    KnowledgeBaseModule,
    SupportTicketsModule,
  ],
  controllers: [ChatbotController],
  providers: [ChatbotService, LlmChatService],
})
export class ChatbotModule {}
