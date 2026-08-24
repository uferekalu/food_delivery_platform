/* eslint-disable @typescript-eslint/no-require-imports -- see health.e2e-spec.ts for why AppModule can't be a static import here */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setupApp } from '../src/setup-app';
import type { NotificationsService } from '../src/notifications/notifications.service';

jest.setTimeout(60_000);

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let mongod: MongoMemoryServer;
  let notificationsService: NotificationsService;

  beforeAll(async () => {
    // See auth.e2e-spec.ts for why `launchTimeout` is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });
    process.env.MONGODB_URI = mongod.getUri();
    process.env.CORS_ORIGINS = 'http://localhost:3000';
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
    process.env.JWT_EMAIL_SECRET = 'c'.repeat(32);
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.MAIL_FROM = 'Food Delivery Platform <noreply@example.com>';
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = '123456789';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_dummy';
    process.env.FLUTTERWAVE_SECRET_KEY = 'FLWSECK_TEST-dummy';
    process.env.FLUTTERWAVE_WEBHOOK_HASH = 'dummy-webhook-hash';

    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');
    const { MailService } =
      require('../src/mail/mail.service') as typeof import('../src/mail/mail.service');
    const { NotificationsService: NotificationsServiceClass } =
      require('../src/notifications/notifications.service') as typeof import('../src/notifications/notifications.service');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
        sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
        sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
    notificationsService = app.get(NotificationsServiceClass);
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    await mongod.stop();
  });

  interface AuthResponseBody {
    user: { id: string; email: string; role: string };
    accessToken: string;
  }

  async function registerAndLogin(email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Str0ngPass1', name: 'Test User' })
      .expect(201);
    return res.body as AuthResponseBody;
  }

  it('runs the full notifications lifecycle: creation side effects, listing, unread count, mark-read, ownership isolation', async () => {
    const server = app.getHttpServer();
    const userA = await registerAndLogin('notif-a@example.com');
    const userB = await registerAndLogin('notif-b@example.com');

    // No auth at all is rejected (guards are global default-deny).
    await request(server).get('/notifications').expect(401);

    // Fresh account starts with nothing.
    const emptyList = await request(server)
      .get('/notifications')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect((emptyList.body as { total: number }).total).toBe(0);
    const emptyCount = await request(server)
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect((emptyCount.body as { count: number }).count).toBe(0);

    // Seed two notifications for userA (via the service — there is no public creation
    // endpoint, matching backend/CLAUDE.md's "one service owns a model's writes" convention)
    // and one for userB, to verify listing is scoped per-user.
    const notif1 = await notificationsService.notify({
      userId: userA.user.id,
      type: 'order_status',
      title: 'Order confirmed',
      body: 'Your order ORD-1 has been confirmed.',
      metadata: { orderId: 'order-1' },
      email: { subject: 'Order confirmed', html: '<p>hi</p>' },
    });
    await notificationsService.notify({
      userId: userA.user.id,
      type: 'order_status',
      title: 'Out for delivery',
      body: 'Your order ORD-1 is out for delivery.',
      sms: 'Your order ORD-1 is out for delivery.',
    });
    await notificationsService.notify({
      userId: userB.user.id,
      type: 'order_status',
      title: "Not userA's business",
      body: 'This belongs to userB.',
    });

    // channels reflects what was actually attempted: inapp always, email only when supplied
    // (and userA has an email, always true), sms only when supplied AND the user has a phone
    // (userA never set one, so sms is never attempted here).
    expect(notif1.channels).toEqual(['inapp', 'email']);

    const listA = await request(server)
      .get('/notifications')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    const listABody = listA.body as {
      total: number;
      items: { title: string; isRead: boolean }[];
    };
    expect(listABody.total).toBe(2);
    // Newest first.
    expect(listABody.items[0].title).toBe('Out for delivery');
    expect(listABody.items[1].title).toBe('Order confirmed');

    const countA = await request(server)
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect((countA.body as { count: number }).count).toBe(2);

    // userB only sees their own notification.
    const listB = await request(server)
      .get('/notifications')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect((listB.body as { total: number }).total).toBe(1);

    // userA can't mark userB's notification as read.
    const notif3Id = (
      (
        await request(server)
          .get('/notifications')
          .set('Authorization', `Bearer ${userB.accessToken}`)
          .expect(200)
      ).body as { items: { _id: string }[] }
    ).items[0]._id;
    await request(server)
      .patch(`/notifications/${notif3Id}/read`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(404);

    // userA marks their own notification read.
    const readRes = await request(server)
      .patch(`/notifications/${notif1._id.toString()}/read`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect((readRes.body as { isRead: boolean }).isRead).toBe(true);

    const countAfterOneRead = await request(server)
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect((countAfterOneRead.body as { count: number }).count).toBe(1);

    // Mark-all-read clears the rest.
    await request(server)
      .patch('/notifications/read-all')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    const countAfterAll = await request(server)
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect((countAfterAll.body as { count: number }).count).toBe(0);

    // userB's unread count is untouched by userA's mark-all-read.
    const countB = await request(server)
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect((countB.body as { count: number }).count).toBe(1);
  });
});
