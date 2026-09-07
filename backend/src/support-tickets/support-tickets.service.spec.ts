import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { SupportTicketsService } from './support-tickets.service';
import {
  SupportTicket,
  SupportTicketDocument,
  SupportTicketSchema,
} from './schemas/support-ticket.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

jest.setTimeout(30_000);

describe('SupportTicketsService (docs/ROADMAP.md FDP-106)', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let service: SupportTicketsService;
  let ticketModel: Model<SupportTicketDocument>;
  let notify: jest.Mock;
  let listAll: jest.Mock;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    notify = jest.fn().mockResolvedValue(undefined);
    listAll = jest.fn().mockResolvedValue({
      items: [{ _id: { toString: () => 'admin-1' } }],
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: SupportTicket.name, schema: SupportTicketSchema },
        ]),
      ],
      providers: [
        SupportTicketsService,
        { provide: NotificationsService, useValue: { notify } },
        { provide: UsersService, useValue: { listAll } },
      ],
    }).compile();

    service = moduleRef.get(SupportTicketsService);
    ticketModel = moduleRef.get(getModelToken(SupportTicket.name));
  }, 60_000);

  afterEach(async () => {
    await ticketModel.deleteMany({}).exec();
    notify.mockClear();
    listAll.mockClear();
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  describe('create', () => {
    it('creates an open ticket for a guest session and notifies every admin', async () => {
      const ticket = await service.create(
        'What time do you open?',
        { userId: null, sessionId: 'session-abc' },
        null,
      );

      expect(ticket.status).toBe('open');
      expect(ticket.userId).toBeNull();
      expect(ticket.sessionId).toBe('session-abc');
      expect(ticket.matchedEntryId).toBeNull();

      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          type: 'support_ticket_created',
        }),
      );
    });

    it('creates a ticket for a logged-in user, recording the near-miss KB entry id', async () => {
      const ticket = await service.create(
        'Can I get a refund?',
        { userId: 'user-1', sessionId: null },
        'entry-123',
      );

      expect(ticket.userId).toBe('user-1');
      expect(ticket.sessionId).toBeNull();
      expect(ticket.matchedEntryId).toBe('entry-123');
    });

    it('still creates the ticket even if notifying admins fails', async () => {
      notify.mockRejectedValueOnce(new Error('notification service down'));

      const ticket = await service.create(
        'hello',
        { userId: null, sessionId: 'session-abc' },
        null,
      );

      expect(ticket).toBeDefined();
    });
  });

  describe('listAll / resolve', () => {
    it('filters by status', async () => {
      await service.create('q1', { userId: null, sessionId: 's1' }, null);
      const second = await service.create(
        'q2',
        { userId: null, sessionId: 's2' },
        null,
      );
      await service.resolve(second._id.toString(), 'admin-1');

      const openOnly = await service.listAll({ page: 1, limit: 20, status: 'open' });
      expect(openOnly.total).toBe(1);
      expect(openOnly.items[0].question).toBe('q1');
    });

    it('resolve sets status/resolvedAt/resolvedBy', async () => {
      const ticket = await service.create(
        'q1',
        { userId: null, sessionId: 's1' },
        null,
      );

      const resolved = await service.resolve(ticket._id.toString(), 'admin-1');

      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedBy).toBe('admin-1');
      expect(resolved.resolvedAt).not.toBeNull();
    });

    it('resolve throws NotFoundException for an unknown id', async () => {
      await expect(
        service.resolve('507f1f77bcf86cd799439011', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
