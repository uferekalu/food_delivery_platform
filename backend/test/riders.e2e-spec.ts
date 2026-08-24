/* eslint-disable @typescript-eslint/no-require-imports -- see health.e2e-spec.ts for why AppModule can't be a static import here */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { setupApp } from '../src/setup-app';
import type { OrderDocument } from '../src/orders/schemas/order.schema';

jest.setTimeout(60_000);

describe('Riders (e2e)', () => {
  let app: INestApplication<App>;
  let mongod: MongoMemoryServer;
  let orderModel: Model<OrderDocument>;

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
    const { Order } =
      require('../src/orders/schemas/order.schema') as typeof import('../src/orders/schemas/order.schema');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
        sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
    orderModel = app.get(getModelToken(Order.name));
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    await mongod.stop();
  });

  interface AuthResponseBody {
    user: { id: string; email: string; role: string };
    accessToken: string;
  }

  async function registerAndLogin(email: string, role?: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'Str0ngPass1',
        name: 'Test User',
        ...(role ? { role } : {}),
      })
      .expect(201);
    return res.body as AuthResponseBody;
  }

  async function reLogin(email: string): Promise<AuthResponseBody> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'Str0ngPass1' })
      .expect(200);
    return res.body as AuthResponseBody;
  }

  // Mirrors orders.service.spec.ts's createOrderAtStatus shortcut: getting an order to
  // READY_FOR_PICKUP for real means driving the full checkout+payment-webhook+owner-queue
  // pipeline, which FDP-11/13/14's own tests already cover — seeding directly here tests this
  // ticket's actual new surface (queue/assign/status/history) without re-deriving all of that.
  async function seedReadyForPickupOrder(
    restaurantId: string,
    customerId: string,
  ) {
    return orderModel.create({
      orderNumber: `ORD-TEST-${Math.random().toString(36).slice(2, 8)}`,
      customerId,
      restaurantId,
      riderId: null,
      items: [
        {
          menuItemId: restaurantId,
          name: 'Jollof Rice',
          price: 10,
          qty: 1,
          selectedModifiers: [],
          notes: '',
        },
      ],
      subtotal: 10,
      deliveryFee: 1,
      serviceFee: 0.5,
      tax: 0,
      discount: 0,
      total: 11.5,
      currency: 'NGN',
      status: 'READY_FOR_PICKUP',
      statusHistory: [
        { status: 'READY_FOR_PICKUP', at: new Date(), by: customerId },
      ],
      paymentProvider: 'paystack',
      paymentStatus: 'succeeded',
      deliveryAddress: { line1: '1 St', city: 'Lagos', state: 'Lagos' },
    });
  }

  it('runs the full rider dispatch lifecycle: apply, verify, queue, assign, status updates, history, ownership enforcement', async () => {
    const server = app.getHttpServer();

    const applicant = await registerAndLogin('rider-applicant@example.com');
    const owner = await registerAndLogin(
      'rd-owner@example.com',
      'restaurant_owner',
    );
    const customer = await registerAndLogin('rd-customer@example.com');
    await registerAndLogin('rd-admin@example.com'); // starts as customer, promoted below

    const { UsersService } =
      require('../src/users/users.service') as typeof import('../src/users/users.service');
    const usersService = app.get(UsersService);
    const adminAccount = await usersService.findByEmail('rd-admin@example.com');
    await usersService.updateRole(adminAccount!._id.toString(), 'admin');
    const adminLogin = await reLogin('rd-admin@example.com');
    const adminToken = adminLogin.accessToken;

    // A plain customer with no rider profile can't reach rider-only endpoints yet.
    await request(server)
      .get('/riders/queue')
      .set('Authorization', `Bearer ${applicant.accessToken}`)
      .expect(403);

    // A restaurant owner can't apply — becoming a rider would overwrite their role and lock
    // them out of their own restaurant dashboard (@Roles('restaurant_owner', 'admin') checks
    // the *current* role, not DB ownership).
    await request(server)
      .post('/riders/apply')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ vehicleType: 'car' })
      .expect(400);

    // Apply to become a rider.
    const applyRes = await request(server)
      .post('/riders/apply')
      .set('Authorization', `Bearer ${applicant.accessToken}`)
      .send({ vehicleType: 'motorcycle' })
      .expect(201);
    const riderProfile = applyRes.body as { _id: string; isVerified: boolean };
    expect(riderProfile.isVerified).toBe(false);

    // A second application is rejected.
    await request(server)
      .post('/riders/apply')
      .set('Authorization', `Bearer ${applicant.accessToken}`)
      .send({ vehicleType: 'car' })
      .expect(400);

    // The old access token still says "customer" — role changes need a fresh token (same
    // pattern as the admin promotion above).
    const riderLogin = await reLogin('rider-applicant@example.com');
    const riderToken = riderLogin.accessToken;
    expect(riderLogin.user.role).toBe('rider');

    // Set up a restaurant + a READY_FOR_PICKUP order to dispatch.
    const restaurantRes = await request(server)
      .post('/restaurants')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Rider Dispatch Kitchen',
        cuisineTypes: ['Test'],
        currency: 'NGN',
        country: 'Nigeria',
        address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
      })
      .expect(201);
    const restaurantId = (restaurantRes.body as { _id: string })._id;
    const order = await seedReadyForPickupOrder(restaurantId, customer.user.id);

    // An unverified rider can see the queue...
    const queueRes = await request(server)
      .get('/riders/queue')
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200);
    expect((queueRes.body as { _id: string }[]).map((o) => o._id)).toContain(
      order._id.toString(),
    );

    // ...but can't self-assign until an admin verifies them.
    await request(server)
      .post(`/riders/orders/${order._id.toString()}/assign`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(403);

    // Admin verifies the rider.
    await request(server)
      .patch(`/riders/${riderProfile._id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const adminListRes = await request(server)
      .get('/riders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (adminListRes.body as { _id: string; isVerified: boolean }[]).find(
        (r) => r._id === riderProfile._id,
      )?.isVerified,
    ).toBe(true);

    // A non-admin can't verify.
    await request(server)
      .patch(`/riders/${riderProfile._id}/verify`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(403);

    // Now the rider can toggle online and self-assign.
    await request(server)
      .patch('/riders/me/toggle-online')
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200, /"isOnline":true/);

    const assignRes = await request(server)
      .post(`/riders/orders/${order._id.toString()}/assign`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(201);
    expect((assignRes.body as { status: string }).status).toBe(
      'ASSIGNED_TO_RIDER',
    );

    // A second rider can't claim the same order.
    const otherRider = await registerAndLogin('other-rider@example.com');
    await request(server)
      .post('/riders/apply')
      .set('Authorization', `Bearer ${otherRider.accessToken}`)
      .send({ vehicleType: 'bicycle' })
      .expect(201);
    const otherRiderLogin = await reLogin('other-rider@example.com');
    await request(server)
      .post(`/riders/orders/${order._id.toString()}/assign`)
      .set('Authorization', `Bearer ${otherRiderLogin.accessToken}`)
      .expect(403); // unverified — rejected before it would even reach the "already assigned" check

    // Walk the rider-triggered status transitions.
    await request(server)
      .patch(`/riders/orders/${order._id.toString()}/status`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'PICKED_UP' })
      .expect(200, /"status":"PICKED_UP"/);

    await request(server)
      .patch(`/riders/orders/${order._id.toString()}/status`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200, /"status":"OUT_FOR_DELIVERY"/);

    await request(server)
      .patch(`/riders/orders/${order._id.toString()}/status`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'DELIVERED' })
      .expect(200, /"status":"DELIVERED"/);

    // Skipping a step is rejected even for the correct rider.
    const secondOrder = await seedReadyForPickupOrder(
      restaurantId,
      customer.user.id,
    );
    await request(server)
      .post(`/riders/orders/${secondOrder._id.toString()}/assign`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(201);
    await request(server)
      .patch(`/riders/orders/${secondOrder._id.toString()}/status`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'DELIVERED' })
      .expect(400);

    // Delivery history shows both orders for this rider.
    const historyRes = await request(server)
      .get('/riders/me/deliveries')
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200);
    const historyIds = (historyRes.body as { _id: string }[]).map((o) => o._id);
    expect(historyIds).toContain(order._id.toString());
    expect(historyIds).toContain(secondOrder._id.toString());
  });
});
