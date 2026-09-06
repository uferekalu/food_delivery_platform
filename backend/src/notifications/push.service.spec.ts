import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import * as webpush from 'web-push';
import { PushService } from './push.service';
import {
  PushSubscription,
  PushSubscriptionDocument,
  PushSubscriptionSchema,
} from './schemas/push-subscription.schema';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

jest.setTimeout(30_000);

describe('PushService', () => {
  let mongod: MongoMemoryServer;
  const sendNotification = webpush.sendNotification as jest.Mock;
  const setVapidDetails = webpush.setVapidDetails as jest.Mock;

  const userId = '507f1f77bcf86cd799439011';
  const subscription = {
    endpoint: 'https://push.example.com/abc',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  };

  beforeAll(async () => {
    // See backend/CLAUDE.md ("Testing") for why launchTimeout is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });
  }, 60_000);

  afterAll(async () => {
    await mongod.stop();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function buildService(config: Record<string, string> = {}): Promise<{
    service: PushService;
    model: Model<PushSubscriptionDocument>;
    ref: TestingModule;
  }> {
    const ref: TestingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: PushSubscription.name, schema: PushSubscriptionSchema },
        ]),
      ],
      providers: [
        PushService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
      ],
    }).compile();
    return {
      service: ref.get(PushService),
      model: ref.get(getModelToken(PushSubscription.name)),
      ref,
    };
  }

  it('is not configured, calls setVapidDetails only when it is, and send() no-ops without throwing when unset', async () => {
    const { service, model, ref } = await buildService({});
    expect(service.isConfigured).toBe(false);
    expect(service.getPublicKey()).toBeNull();
    expect(setVapidDetails).not.toHaveBeenCalled();

    await service.subscribe(userId, subscription);
    await expect(
      service.send(userId, { title: 't', body: 'b' }),
    ).resolves.toBeUndefined();
    expect(sendNotification).not.toHaveBeenCalled();

    await model.deleteMany({}).exec();
    await ref.close();
  });

  it('calls setVapidDetails once configured, and exposes the public key', async () => {
    const { service, model, ref } = await buildService({
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'mailto:test@example.com',
    });

    expect(service.isConfigured).toBe(true);
    expect(service.getPublicKey()).toBe('pub');
    expect(setVapidDetails).toHaveBeenCalledWith(
      'mailto:test@example.com',
      'pub',
      'priv',
    );

    await model.deleteMany({}).exec();
    await ref.close();
  });

  it('subscribe upserts on endpoint, and send() delivers to every subscription for the user', async () => {
    const { service, model, ref } = await buildService({
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'mailto:test@example.com',
    });
    sendNotification.mockResolvedValue(undefined);

    await service.subscribe(userId, subscription);
    // Re-subscribing the same endpoint (e.g. the browser refreshing its own registration)
    // updates the existing row rather than creating a duplicate.
    await service.subscribe(userId, subscription);
    await service.subscribe(userId, {
      endpoint: 'https://push.example.com/second-device',
      keys: { p256dh: 'p2', auth: 'a2' },
    });

    expect(await model.countDocuments({ userId }).exec()).toBe(2);

    await service.send(userId, { title: 'Hello', body: 'World' });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify({ title: 'Hello', body: 'World', url: '/notifications' }),
    );

    await model.deleteMany({}).exec();
    await ref.close();
  });

  it('defaults the click-through url to /notifications when none is given, and uses a custom one when given', async () => {
    const { service, model, ref } = await buildService({
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'mailto:test@example.com',
    });
    sendNotification.mockResolvedValue(undefined);
    await service.subscribe(userId, subscription);

    await service.send(userId, { title: 't', body: 'b', url: '/orders/123' });

    expect(sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      JSON.stringify({ title: 't', body: 'b', url: '/orders/123' }),
    );

    await model.deleteMany({}).exec();
    await ref.close();
  });

  it('does nothing when the user has no saved subscription', async () => {
    const { service, ref } = await buildService({
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'mailto:test@example.com',
    });

    await service.send(userId, { title: 't', body: 'b' });
    expect(sendNotification).not.toHaveBeenCalled();

    await ref.close();
  });

  it('deletes a subscription on a 404/410 (gone) response, but keeps it on any other error', async () => {
    const { service, model, ref } = await buildService({
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'mailto:test@example.com',
    });
    await service.subscribe(userId, subscription);
    await service.subscribe(userId, {
      endpoint: 'https://push.example.com/still-good',
      keys: { p256dh: 'p2', auth: 'a2' },
    });

    sendNotification.mockImplementation((sub: { endpoint: string }) => {
      if (sub.endpoint === subscription.endpoint) {
        const err = new Error('gone') as Error & { statusCode: number };
        err.statusCode = 410;
        return Promise.reject(err);
      }
      const err = new Error('transient outage') as Error & {
        statusCode: number;
      };
      err.statusCode = 500;
      return Promise.reject(err);
    });

    await service.send(userId, { title: 't', body: 'b' });

    const remaining = await model.find({ userId }).exec();
    expect(remaining.map((s) => s.endpoint)).toEqual([
      'https://push.example.com/still-good',
    ]);

    await model.deleteMany({}).exec();
    await ref.close();
  });

  it('unsubscribe removes only the matching user+endpoint pair', async () => {
    const { service, model, ref } = await buildService({});
    await service.subscribe(userId, subscription);
    await service.subscribe('some-other-user', {
      endpoint: 'https://push.example.com/other-user',
      keys: { p256dh: 'p2', auth: 'a2' },
    });

    await service.unsubscribe(userId, subscription.endpoint);

    expect(await model.countDocuments({}).exec()).toBe(1);
    expect(
      await model.findOne({ userId: 'some-other-user' }).exec(),
    ).not.toBeNull();

    await model.deleteMany({}).exec();
    await ref.close();
  });
});
