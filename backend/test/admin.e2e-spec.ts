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

describe('Admin (e2e)', () => {
  let app: INestApplication<App>;
  let mongod: MongoMemoryServer;
  let orderModel: Model<OrderDocument>;
  let stripeRefund: jest.Mock;

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
    const { StripeAdapter } =
      require('../src/payments/adapters/stripe.adapter') as typeof import('../src/payments/adapters/stripe.adapter');
    const { Order } =
      require('../src/orders/schemas/order.schema') as typeof import('../src/orders/schemas/order.schema');

    stripeRefund = jest.fn().mockResolvedValue(undefined);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
        sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
        sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
      })
      // Never let a refund test hit the real Stripe API with a dummy key — same reasoning as
      // overriding MailService above, just for the payment-adapter boundary instead.
      .overrideProvider(StripeAdapter)
      .useValue({
        initiate: jest.fn(),
        verify: jest.fn(),
        handleWebhook: jest.fn(),
        refund: stripeRefund,
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
        name: 'Admin Test User',
        ...(role ? { role } : {}),
      })
      .expect(201);
    return res.body as AuthResponseBody;
  }

  async function makeAdmin(email: string, id: string): Promise<string> {
    const { UsersService } =
      require('../src/users/users.service') as typeof import('../src/users/users.service');
    await app.get(UsersService).updateRole(id, 'admin');
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'Str0ngPass1' })
      .expect(200);
    return (loginRes.body as AuthResponseBody).accessToken;
  }

  it('runs the full admin lifecycle: restaurant approval, rider verification, promo code management, refund, analytics, and role-gating', async () => {
    const server = app.getHttpServer();

    const owner = await registerAndLogin(
      'admin-owner@example.com',
      'restaurant_owner',
    );
    const customer = await registerAndLogin('admin-customer@example.com');
    const riderAccount = await registerAndLogin('admin-rider@example.com');
    const adminAccount = await registerAndLogin('admin-admin@example.com');
    const adminToken = await makeAdmin(
      adminAccount.user.email,
      adminAccount.user.id,
    );

    // --- Restaurant approval workflow ---
    const restaurantRes = await request(server)
      .post('/restaurants')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Admin Test Kitchen',
        cuisineTypes: ['Test'],
        currency: 'NGN',
        country: 'Nigeria',
        address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
      })
      .expect(201);
    const restaurantId = (restaurantRes.body as { _id: string })._id;

    // A non-admin can't see the pending queue.
    await request(server)
      .get('/restaurants/pending')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(403);

    const pendingRes = await request(server)
      .get('/restaurants/pending')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (pendingRes.body as { _id: string }[]).some(
        (r) => r._id === restaurantId,
      ),
    ).toBe(true);

    await request(server)
      .patch(`/restaurants/${restaurantId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const pendingAfterRes = await request(server)
      .get('/restaurants/pending')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (pendingAfterRes.body as { _id: string }[]).some(
        (r) => r._id === restaurantId,
      ),
    ).toBe(false);

    // --- Rider verification ---
    const applyRes = await request(server)
      .post('/riders/apply')
      .set('Authorization', `Bearer ${riderAccount.accessToken}`)
      .send({ vehicleType: 'bicycle' })
      .expect(201);
    const riderId = (applyRes.body as { _id: string })._id;

    const allRidersRes = await request(server)
      .get('/riders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (allRidersRes.body as { _id: string; isVerified: boolean }[]).find(
        (r) => r._id === riderId,
      )?.isVerified,
    ).toBe(false);

    await request(server)
      .patch(`/riders/${riderId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // --- Promo code management ---
    const promoRes = await request(server)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'ADMINTEST10',
        discountType: 'percentage',
        discountValue: 10,
      })
      .expect(201);
    const promoId = (promoRes.body as { _id: string })._id;

    await request(server)
      .patch(`/promo-codes/${promoId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    const promoListRes = await request(server)
      .get('/promo-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (promoListRes.body as { _id: string; isActive: boolean }[]).find(
        (p) => p._id === promoId,
      )?.isActive,
    ).toBe(false);

    // --- Refund a delivered order ---
    const order = await orderModel.create({
      orderNumber: 'ORD-ADMIN-REFUND',
      customerId: customer.user.id,
      restaurantId,
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
      platformFeeAmount: 1.5,
      restaurantPayoutAmount: 8.5,
      currency: 'NGN',
      status: 'DELIVERED',
      statusHistory: [
        { status: 'DELIVERED', at: new Date(), by: customer.user.id },
      ],
      paymentProvider: 'stripe',
      paymentStatus: 'succeeded',
      paymentRef: 'cs_test_admin_refund',
      deliveryAddress: { line1: '1 St', city: 'Lagos', state: 'Lagos' },
    });

    // Admin can look the order up directly (no ownership check).
    const adminOrderRes = await request(server)
      .get(`/orders/admin/${order._id.toString()}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((adminOrderRes.body as { orderNumber: string }).orderNumber).toBe(
      'ORD-ADMIN-REFUND',
    );

    // A non-admin can't use the admin lookup or trigger a refund.
    await request(server)
      .get(`/orders/admin/${order._id.toString()}`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(403);
    await request(server)
      .post(`/payments/${order._id.toString()}/refund`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(403);

    const refundRes = await request(server)
      .post(`/payments/${order._id.toString()}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(
      (refundRes.body as { status: string; paymentStatus: string }).status,
    ).toBe('REFUNDED');
    expect(
      (refundRes.body as { status: string; paymentStatus: string })
        .paymentStatus,
    ).toBe('refunded');
    expect(stripeRefund).toHaveBeenCalledWith('cs_test_admin_refund');

    // A second refund attempt is rejected — the order is no longer DELIVERED.
    await request(server)
      .post(`/payments/${order._id.toString()}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    // --- Analytics ---
    const analyticsRes = await request(server)
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const analytics = analyticsRes.body as {
      orders: {
        total: number;
        byStatus: Record<string, number>;
        revenueByCurrency: Record<string, number>;
      };
      restaurants: { approved: number; pending: number };
      riders: { verified: number; pending: number };
      users: Record<string, number>;
    };
    expect(analytics.orders.total).toBeGreaterThanOrEqual(1);
    expect(analytics.orders.byStatus.REFUNDED).toBeGreaterThanOrEqual(1);
    expect(analytics.restaurants.approved).toBeGreaterThanOrEqual(1);
    expect(analytics.riders.verified).toBeGreaterThanOrEqual(1);
    expect(analytics.users.customer).toBeGreaterThanOrEqual(1);

    await request(server)
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(403);
  });
});
