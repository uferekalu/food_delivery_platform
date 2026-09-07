import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { ChatbotService, CHATBOT_FALLBACK_MESSAGE } from './chatbot.service';
import { ChatMessage, ChatMessageDocument, ChatMessageSchema } from './schemas/chat-message.schema';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import {
  KnowledgeBaseEntry,
  KnowledgeBaseEntrySchema,
} from '../knowledge-base/schemas/knowledge-base-entry.schema';
import { SupportTicketsService } from '../support-tickets/support-tickets.service';
import {
  SupportTicket,
  SupportTicketDocument,
  SupportTicketSchema,
} from '../support-tickets/schemas/support-ticket.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

jest.setTimeout(30_000);

describe('ChatbotService (docs/ROADMAP.md FDP-106)', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let service: ChatbotService;
  let knowledgeBaseService: KnowledgeBaseService;
  let chatMessageModel: Model<ChatMessageDocument>;
  let ticketModel: Model<SupportTicketDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: ChatMessage.name, schema: ChatMessageSchema },
          { name: KnowledgeBaseEntry.name, schema: KnowledgeBaseEntrySchema },
          { name: SupportTicket.name, schema: SupportTicketSchema },
        ]),
      ],
      providers: [
        ChatbotService,
        KnowledgeBaseService,
        SupportTicketsService,
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: UsersService,
          useValue: {
            listAll: jest
              .fn()
              .mockResolvedValue({ items: [], total: 0, page: 1, limit: 50, totalPages: 0 }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ChatbotService);
    knowledgeBaseService = moduleRef.get(KnowledgeBaseService);
    chatMessageModel = moduleRef.get(getModelToken(ChatMessage.name));
    ticketModel = moduleRef.get(getModelToken(SupportTicket.name));
  }, 60_000);

  afterEach(async () => {
    await Promise.all([
      chatMessageModel.deleteMany({}).exec(),
      ticketModel.deleteMany({}).exec(),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  describe('ask', () => {
    it('returns the matched KB answer and creates no support ticket', async () => {
      await knowledgeBaseService.create({
        question: 'Delivery areas?',
        answer: 'We deliver within each seller’s zone.',
        keywords: ['delivery area', 'where do you deliver'],
        category: 'delivery',
      });

      const result = await service.ask(
        { userId: 'user-1', sessionId: null },
        { message: 'where do you deliver to?' },
      );

      expect(result.matched).toBe(true);
      expect(result.answer).toContain('We deliver');
      expect(result.ticketId).toBeUndefined();
      expect(await ticketModel.countDocuments().exec()).toBe(0);
    });

    it('falls back to the honest fallback message and creates a support ticket when nothing matches confidently', async () => {
      const result = await service.ask(
        { userId: null, sessionId: 'session-abc' },
        { message: 'do you sell used cars' },
      );

      expect(result.matched).toBe(false);
      expect(result.answer).toBe(CHATBOT_FALLBACK_MESSAGE);
      expect(result.ticketId).toBeDefined();

      const tickets = await ticketModel.find().exec();
      expect(tickets).toHaveLength(1);
      expect(tickets[0].sessionId).toBe('session-abc');
      expect(tickets[0].question).toBe('do you sell used cars');
    });

    it('records the closest below-threshold KB entry on the ticket as admin context', async () => {
      const entry = await knowledgeBaseService.create({
        question: 'Refund policy?',
        answer: 'Delivered or cancelled-after-payment orders can be refunded.',
        keywords: ['refund'],
        category: 'refunds',
      });

      const result = await service.ask(
        { userId: null, sessionId: 'session-abc' },
        { message: 'I want a refund please' },
      );

      expect(result.matched).toBe(false); // single one-word hit, below threshold
      const tickets = await ticketModel.find().exec();
      expect(tickets[0].matchedEntryId).toBe(entry._id.toString());
    });

    it('logs every exchange to the chat history, matched or not', async () => {
      await service.ask(
        { userId: null, sessionId: 'session-abc' },
        { message: 'anything' },
      );

      const logged = await chatMessageModel.find().exec();
      expect(logged).toHaveLength(1);
      expect(logged[0].sessionId).toBe('session-abc');
      expect(logged[0].matched).toBe(false);
    });
  });

  describe('history', () => {
    it('scopes history to the authenticated user, never a guest session with the same id string', async () => {
      await service.ask({ userId: 'user-1', sessionId: null }, { message: 'q1' });
      await service.ask({ userId: null, sessionId: 'user-1' }, { message: 'q2' });

      const userHistory = await service.history({ userId: 'user-1', sessionId: null });
      expect(userHistory).toHaveLength(1);
      expect(userHistory[0].message).toBe('q1');
    });

    it('returns messages oldest-first', async () => {
      await service.ask({ userId: null, sessionId: 's1' }, { message: 'first' });
      await service.ask({ userId: null, sessionId: 's1' }, { message: 'second' });

      const history = await service.history({ userId: null, sessionId: 's1' });
      expect(history.map((m) => m.message)).toEqual(['first', 'second']);
    });
  });
});
