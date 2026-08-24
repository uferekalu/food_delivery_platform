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

describe('Reviews (e2e)', () => {
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
        sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
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

  // Mirrors riders.e2e-spec.ts's seedReadyForPickupOrder shortcut — a real DELIVERED order
  // means driving the full checkout+payment+rider-dispatch pipeline FDP-11/13/14/16's own
  // tests already cover; seeding directly here tests this ticket's actual new surface.
  async function seedDeliveredOrder(
    restaurantId: string,
    customerId: string,
    riderId: string | null,
  ) {
    return orderModel.create({
      orderNumber: `ORD-TEST-${Math.random().toString(36).slice(2, 8)}`,
      customerId,
      restaurantId,
      riderId,
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
      status: 'DELIVERED',
      statusHistory: [{ status: 'DELIVERED', at: new Date(), by: customerId }],
      paymentProvider: 'paystack',
      paymentStatus: 'succeeded',
      deliveryAddress: { line1: '1 St', city: 'Lagos', state: 'Lagos' },
    });
  }

  it('runs the full reviews lifecycle: eligibility, create, duplicate/ownership/not-delivered rejection, public listing, rating recompute', async () => {
    const server = app.getHttpServer();

    const owner = await registerAndLogin(
      'rv-owner@example.com',
      'restaurant_owner',
    );
    const customer = await registerAndLogin('rv-customer@example.com');
    const intruder = await registerAndLogin('rv-intruder@example.com');
    const riderAccount = await registerAndLogin('rv-rider@example.com');

    // Set up a verified rider.
    const applyRes = await request(server)
      .post('/riders/apply')
      .set('Authorization', `Bearer ${riderAccount.accessToken}`)
      .send({ vehicleType: 'bicycle' })
      .expect(201);
    const riderProfileId = (applyRes.body as { _id: string })._id;

    const { UsersService } =
      require('../src/users/users.service') as typeof import('../src/users/users.service');
    const usersService = app.get(UsersService);
    const adminAccount = await registerAndLogin('rv-admin@example.com');
    await usersService.updateRole(adminAccount.user.id, 'admin');
    const adminLoginRes = await request(server)
      .post('/auth/login')
      .send({ email: 'rv-admin@example.com', password: 'Str0ngPass1' })
      .expect(200);
    const adminToken = (adminLoginRes.body as AuthResponseBody).accessToken;
    await request(server)
      .patch(`/riders/${riderProfileId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Restaurant.
    const restaurantRes = await request(server)
      .post('/restaurants')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Review Test Kitchen',
        cuisineTypes: ['Test'],
        currency: 'NGN',
        country: 'Nigeria',
        address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
      })
      .expect(201);
    const restaurantId = (restaurantRes.body as { _id: string })._id;

    // Delivered order with a rider, and one without a rider.
    const orderWithRider = await seedDeliveredOrder(
      restaurantId,
      customer.user.id,
      riderAccount.user.id,
    );
    const orderNoRider = await seedDeliveredOrder(
      restaurantId,
      customer.user.id,
      null,
    );

    // Eligibility before reviewing anything.
    const eligibilityRes = await request(server)
      .get(`/reviews/eligibility/${orderWithRider._id.toString()}`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(200);
    expect(eligibilityRes.body).toEqual({ restaurant: true, rider: true });

    // An intruder can't check eligibility for someone else's order.
    await request(server)
      .get(`/reviews/eligibility/${orderWithRider._id.toString()}`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(403);

    // Create the restaurant review.
    const reviewRes = await request(server)
      .post('/reviews')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        targetType: 'restaurant',
        orderId: orderWithRider._id.toString(),
        rating: 5,
        comment: 'Excellent!',
      })
      .expect(201);
    expect((reviewRes.body as { rating: number }).rating).toBe(5);

    // Duplicate review for the same order/target is rejected.
    await request(server)
      .post('/reviews')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        targetType: 'restaurant',
        orderId: orderWithRider._id.toString(),
        rating: 1,
      })
      .expect(400);

    // Someone who didn't place the order can't review it.
    await request(server)
      .post('/reviews')
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .send({
        targetType: 'restaurant',
        orderId: orderNoRider._id.toString(),
        rating: 3,
      })
      .expect(403);

    // Reviewing the rider on the order that had no rider is rejected.
    await request(server)
      .post('/reviews')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        targetType: 'rider',
        orderId: orderNoRider._id.toString(),
        rating: 5,
      })
      .expect(400);

    // Review the rider on the order that did have one.
    await request(server)
      .post('/reviews')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        targetType: 'rider',
        orderId: orderWithRider._id.toString(),
        rating: 4,
      })
      .expect(201);

    // Public listing, no auth required.
    const listRes = await request(server)
      .get(`/reviews?targetType=restaurant&targetId=${restaurantId}`)
      .expect(200);
    const listBody = listRes.body as {
      total: number;
      items: { rating: number }[];
    };
    expect(listBody.total).toBe(1);
    expect(listBody.items[0].rating).toBe(5);

    // The restaurant's avgRating/reviewCount actually updated (approve it first — the public
    // detail lookup requires isApproved, same as the listing).
    await request(server)
      .patch(`/restaurants/${restaurantId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const approvedRestaurant = await request(server)
      .get(`/restaurants/review-test-kitchen`)
      .expect(200);
    const restaurantBody = approvedRestaurant.body as {
      avgRating: number;
      reviewCount: number;
    };
    expect(restaurantBody.avgRating).toBe(5);
    expect(restaurantBody.reviewCount).toBe(1);
  });
});
