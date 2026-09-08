import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { VendorMessagesService } from './vendor-messages.service';
import {
  VendorMessage,
  VendorMessageDocument,
  VendorMessageSchema,
} from './schemas/vendor-message.schema';
import {
  VendorConversation,
  VendorConversationDocument,
  VendorConversationSchema,
} from './schemas/vendor-conversation.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

jest.setTimeout(30_000);

const VENDOR_ID = new Types.ObjectId().toString();
const OTHER_VENDOR_ID = new Types.ObjectId().toString();

function fakeUser(
  overrides: Partial<{ _id: string; role: string; name: string }> = {},
) {
  const id = overrides._id ?? VENDOR_ID;
  return {
    _id: { toString: () => id },
    role: overrides.role ?? 'restaurant_owner',
    name: overrides.name ?? 'Vendor Vera',
  };
}

describe('VendorMessagesService (docs/ROADMAP.md FDP-108)', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let service: VendorMessagesService;
  let messageModel: Model<VendorMessageDocument>;
  let conversationModel: Model<VendorConversationDocument>;
  let notify: jest.Mock;
  let listAll: jest.Mock;
  let findById: jest.Mock;
  let findByIds: jest.Mock;
  let emitVendorMessage: jest.Mock;

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
    findById = jest.fn().mockResolvedValue(fakeUser());
    findByIds = jest.fn().mockResolvedValue([]);
    emitVendorMessage = jest.fn();

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: VendorMessage.name, schema: VendorMessageSchema },
          { name: VendorConversation.name, schema: VendorConversationSchema },
        ]),
      ],
      providers: [
        VendorMessagesService,
        { provide: NotificationsService, useValue: { notify } },
        { provide: UsersService, useValue: { listAll, findById, findByIds } },
        { provide: RealtimeGateway, useValue: { emitVendorMessage } },
      ],
    }).compile();

    service = moduleRef.get(VendorMessagesService);
    messageModel = moduleRef.get(getModelToken(VendorMessage.name));
    conversationModel = moduleRef.get(getModelToken(VendorConversation.name));
  }, 60_000);

  afterEach(async () => {
    await messageModel.deleteMany({}).exec();
    await conversationModel.deleteMany({}).exec();
    notify.mockClear();
    listAll.mockClear();
    findById.mockClear();
    findById.mockResolvedValue(fakeUser());
    findByIds.mockClear();
    findByIds.mockResolvedValue([]);
    emitVendorMessage.mockClear();
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  describe('sendFromVendor', () => {
    it('creates the message, upserts the conversation, pushes live, and notifies every admin', async () => {
      const message = await service.sendFromVendor(
        VENDOR_ID,
        'My payout failed, why?',
      );

      expect(message.vendorId).toBe(VENDOR_ID);
      expect(message.senderId).toBe(VENDOR_ID);
      expect(message.senderRole).toBe('restaurant_owner');

      const conversation = await conversationModel
        .findOne({ vendorId: VENDOR_ID })
        .exec();
      expect(conversation).not.toBeNull();
      expect(conversation!.unreadByAdmin).toBe(1);
      expect(conversation!.unreadByVendor).toBe(0);
      expect(conversation!.lastSenderRole).toBe('restaurant_owner');
      expect(conversation!.lastMessagePreview).toBe('My payout failed, why?');

      expect(emitVendorMessage).toHaveBeenCalledWith(
        VENDOR_ID,
        expect.objectContaining({ body: 'My payout failed, why?' }),
      );
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          type: 'new_vendor_message',
        }),
      );
    });

    it('increments unreadByAdmin and updates the preview on a second message', async () => {
      await service.sendFromVendor(VENDOR_ID, 'First message');
      await service.sendFromVendor(VENDOR_ID, 'Second message');

      const conversation = await conversationModel
        .findOne({ vendorId: VENDOR_ID })
        .exec();
      expect(conversation!.unreadByAdmin).toBe(2);
      expect(conversation!.lastMessagePreview).toBe('Second message');
    });

    it('truncates a long body into the conversation preview', async () => {
      const long = 'x'.repeat(200);
      await service.sendFromVendor(VENDOR_ID, long);

      const conversation = await conversationModel
        .findOne({ vendorId: VENDOR_ID })
        .exec();
      expect(conversation!.lastMessagePreview.length).toBeLessThan(long.length);
      expect(conversation!.lastMessagePreview.endsWith('…')).toBe(true);
    });

    it('still creates the message even if notifying admins fails', async () => {
      notify.mockRejectedValueOnce(new Error('notification service down'));

      const message = await service.sendFromVendor(VENDOR_ID, 'hello');

      expect(message).toBeDefined();
    });
  });

  describe('sendFromAdmin', () => {
    it('creates the message, upserts the conversation, pushes live, and notifies the vendor', async () => {
      const message = await service.sendFromAdmin(
        'admin-1',
        VENDOR_ID,
        'We refunded that order.',
      );

      expect(message.senderId).toBe('admin-1');
      expect(message.senderRole).toBe('admin');

      const conversation = await conversationModel
        .findOne({ vendorId: VENDOR_ID })
        .exec();
      expect(conversation!.unreadByVendor).toBe(1);
      expect(conversation!.unreadByAdmin).toBe(0);
      expect(conversation!.lastSenderRole).toBe('admin');

      expect(emitVendorMessage).toHaveBeenCalledWith(
        VENDOR_ID,
        expect.objectContaining({ body: 'We refunded that order.' }),
      );
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: VENDOR_ID,
          type: 'new_admin_message',
        }),
      );
    });

    it('throws NotFoundException when the target user does not exist', async () => {
      findById.mockResolvedValueOnce(null);

      await expect(
        service.sendFromAdmin('admin-1', 'ghost-id', 'hi'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the target user is not a vendor', async () => {
      findById.mockResolvedValueOnce(fakeUser({ role: 'customer' }));

      await expect(
        service.sendFromAdmin('admin-1', 'customer-id', 'hi'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMessages', () => {
    it('returns a vendor thread sorted oldest-first', async () => {
      await service.sendFromVendor(VENDOR_ID, 'first');
      await service.sendFromAdmin('admin-1', VENDOR_ID, 'second');
      await service.sendFromVendor(VENDOR_ID, 'third');

      const messages = await service.getMessages(VENDOR_ID);
      expect(messages.map((m) => m.body)).toEqual(['first', 'second', 'third']);
    });

    it('only returns messages for the requested vendor', async () => {
      await service.sendFromVendor(VENDOR_ID, 'mine');
      await service.sendFromVendor(OTHER_VENDOR_ID, 'not mine');

      const messages = await service.getMessages(VENDOR_ID);
      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe('mine');
    });
  });

  describe('listConversationsForAdmin', () => {
    it('resolves vendor names and sorts by most recently active', async () => {
      await service.sendFromVendor(VENDOR_ID, 'older');
      await service.sendFromVendor(OTHER_VENDOR_ID, 'newer');
      findByIds.mockResolvedValueOnce([
        fakeUser({ _id: VENDOR_ID, name: 'Vera' }),
        fakeUser({ _id: OTHER_VENDOR_ID, name: 'Omar' }),
      ]);

      const result = await service.listConversationsForAdmin({
        page: 1,
        limit: 20,
      });

      expect(result.total).toBe(2);
      expect(result.items[0].vendorId).toBe(OTHER_VENDOR_ID);
      expect(result.items[0].vendorName).toBe('Omar');
      expect(result.items[1].vendorName).toBe('Vera');
    });

    it('returns vendorName null for a conversation whose vendor no longer resolves', async () => {
      await service.sendFromVendor(VENDOR_ID, 'orphaned');
      findByIds.mockResolvedValueOnce([]);

      const result = await service.listConversationsForAdmin({
        page: 1,
        limit: 20,
      });

      expect(result.items[0].vendorName).toBeNull();
    });
  });

  describe('markReadByVendor / markReadByAdmin', () => {
    it('resets the vendor-side unread counter', async () => {
      await service.sendFromAdmin('admin-1', VENDOR_ID, 'hi');
      await service.markReadByVendor(VENDOR_ID);

      const conversation = await conversationModel
        .findOne({ vendorId: VENDOR_ID })
        .exec();
      expect(conversation!.unreadByVendor).toBe(0);
    });

    it('resets the admin-side unread counter', async () => {
      await service.sendFromVendor(VENDOR_ID, 'hi');
      await service.markReadByAdmin(VENDOR_ID);

      const conversation = await conversationModel
        .findOne({ vendorId: VENDOR_ID })
        .exec();
      expect(conversation!.unreadByAdmin).toBe(0);
    });
  });
});
