import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { NotificationsService } from './notifications.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from './sms.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  Notification,
  NotificationDocument,
  NotificationSchema,
} from './schemas/notification.schema';

jest.setTimeout(30_000);

describe('NotificationsService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let service: NotificationsService;
  let notificationModel: Model<NotificationDocument>;
  let usersService: { findById: jest.Mock };
  let mailService: { sendNotificationEmail: jest.Mock };
  let smsService: { send: jest.Mock };
  let realtimeGateway: { emitNotification: jest.Mock };

  beforeAll(async () => {
    // See backend/CLAUDE.md ("Testing") for why launchTimeout is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Notification.name, schema: NotificationSchema },
        ]),
      ],
      providers: [
        NotificationsService,
        {
          provide: UsersService,
          useValue: { findById: jest.fn() },
        },
        {
          provide: MailService,
          useValue: {
            sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SmsService,
          useValue: { send: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: RealtimeGateway,
          useValue: { emitNotification: jest.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(NotificationsService);
    notificationModel = moduleRef.get(getModelToken(Notification.name));
    usersService = moduleRef.get(UsersService);
    mailService = moduleRef.get(MailService);
    smsService = moduleRef.get(SmsService);
    realtimeGateway = moduleRef.get(RealtimeGateway);
  }, 60_000);

  afterEach(async () => {
    await notificationModel.deleteMany({}).exec();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  const userId = '507f1f77bcf86cd799439011';

  it('always creates an inapp row and pushes a live realtime event, even with no email/sms requested', async () => {
    const notification = await service.notify({
      userId,
      type: 'order_status',
      title: 'Order confirmed',
      body: 'Body text',
    });

    expect(notification.channels).toEqual(['inapp']);
    expect(realtimeGateway.emitNotification).toHaveBeenCalledWith(
      userId,
      notification,
    );
    expect(usersService.findById).not.toHaveBeenCalled(); // no need to look the user up at all
    expect(mailService.sendNotificationEmail).not.toHaveBeenCalled();
    expect(smsService.send).not.toHaveBeenCalled();
  });

  it('adds "email" to channels and sends it when an email payload is given and the user exists', async () => {
    usersService.findById.mockResolvedValue({
      email: 'a@example.com',
      phone: null,
    });

    const notification = await service.notify({
      userId,
      type: 'order_status',
      title: 'Order confirmed',
      body: 'Body text',
      email: { subject: 'Subject', html: '<p>hi</p>' },
    });

    expect(notification.channels).toEqual(['inapp', 'email']);
    expect(mailService.sendNotificationEmail).toHaveBeenCalledWith(
      'a@example.com',
      'Subject',
      '<p>hi</p>',
    );
  });

  it('does not add "sms" to channels when the user has no saved phone, even if sms text is given', async () => {
    usersService.findById.mockResolvedValue({
      email: 'a@example.com',
      phone: null,
    });

    const notification = await service.notify({
      userId,
      type: 'order_status',
      title: 'Out for delivery',
      body: 'Body text',
      sms: 'Text message',
    });

    expect(notification.channels).toEqual(['inapp']);
    expect(smsService.send).not.toHaveBeenCalled();
  });

  it('adds "sms" to channels and sends it when the user has a saved phone', async () => {
    usersService.findById.mockResolvedValue({
      email: 'a@example.com',
      phone: '+15551234567',
    });

    const notification = await service.notify({
      userId,
      type: 'order_status',
      title: 'Out for delivery',
      body: 'Body text',
      sms: 'Text message',
    });

    expect(notification.channels).toEqual(['inapp', 'sms']);
    expect(smsService.send).toHaveBeenCalledWith(
      '+15551234567',
      'Text message',
    );
  });

  it('an email delivery failure is logged and swallowed, not thrown', async () => {
    usersService.findById.mockResolvedValue({
      email: 'a@example.com',
      phone: null,
    });
    mailService.sendNotificationEmail.mockRejectedValueOnce(
      new Error('Resend down'),
    );

    await expect(
      service.notify({
        userId,
        type: 'order_status',
        title: 'Order confirmed',
        body: 'Body text',
        email: { subject: 'Subject', html: '<p>hi</p>' },
      }),
    ).resolves.toBeDefined();
  });

  describe('findMine / unreadCount / markRead / markAllRead', () => {
    it('paginates newest-first, scoped to the caller, and tracks unread count', async () => {
      const otherUserId = '507f1f77bcf86cd799439099';
      await service.notify({
        userId,
        type: 'order_status',
        title: 'First',
        body: 'b',
      });
      const second = await service.notify({
        userId,
        type: 'order_status',
        title: 'Second',
        body: 'b',
      });
      await service.notify({
        userId: otherUserId,
        type: 'order_status',
        title: 'Not mine',
        body: 'b',
      });

      const page = await service.findMine(userId, { page: 1, limit: 20 });
      expect(page.total).toBe(2);
      expect(page.items[0].title).toBe('Second'); // newest first

      expect(await service.unreadCount(userId)).toBe(2);

      const read = await service.markRead(userId, second._id.toString());
      expect(read.isRead).toBe(true);
      expect(await service.unreadCount(userId)).toBe(1);

      await expect(
        service.markRead(otherUserId, second._id.toString()),
      ).rejects.toThrow(NotFoundException);

      await service.markAllRead(userId);
      expect(await service.unreadCount(userId)).toBe(0);
      // Doesn't touch another user's notifications.
      expect(await service.unreadCount(otherUserId)).toBe(1);
    });
  });
});
