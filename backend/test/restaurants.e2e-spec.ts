/* eslint-disable @typescript-eslint/no-require-imports -- see health.e2e-spec.ts for why AppModule can't be a static import here */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setupApp } from '../src/setup-app';

// Higher than the other e2e specs' 30s: this file's one test does several sequential
// registrations (each a bcrypt cost-12 hash, ~3-4s on this machine — see backend/CLAUDE.md)
// plus a full create/approve/browse/menu-CRUD/ownership-enforcement lifecycle in one `it()`.
// 30s was cutting it close even before FDP-6 and started intermittently exceeding it.
jest.setTimeout(60_000);

describe('Restaurants + Menu (e2e)', () => {
  let app: INestApplication<App>;
  let mongod: MongoMemoryServer;

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
  }, 60_000); // headroom for the 60s mongod launchTimeout above, not just app.init()

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

  it('runs the full restaurant + menu lifecycle: create, hidden-until-approved, approve, browse, menu CRUD, ownership enforcement', async () => {
    const server = app.getHttpServer();

    const owner = await registerAndLogin(
      'owner@example.com',
      'restaurant_owner',
    );
    const otherOwner = await registerAndLogin(
      'other-owner@example.com',
      'restaurant_owner',
    );
    await registerAndLogin('admin@example.com'); // starts as customer, promoted below

    // Bootstrap: promote that account via UsersService directly (mirrors what `npm run
    // seed:admin` does for the very first admin in a real environment). A fresh login is
    // needed afterward — the access token issued at registration still has role: customer
    // baked into its JWT payload; role changes only take effect on the *next* token issue.
    const { UsersService } =
      require('../src/users/users.service') as typeof import('../src/users/users.service');
    const usersService = app.get(UsersService);
    const adminAccount = await usersService.findByEmail('admin@example.com');
    await usersService.updateRole(adminAccount!._id.toString(), 'admin');
    const adminLogin = await request(server)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'Str0ngPass1' })
      .expect(200);
    const adminToken = (adminLogin.body as AuthResponseBody).accessToken;

    // A plain customer cannot create a restaurant.
    const customer = await registerAndLogin('customer@example.com');
    await request(server)
      .post('/restaurants')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        name: 'Should Fail',
        cuisineTypes: ['Test'],
        currency: 'NGN',
        country: 'Nigeria',
        address: { line1: '1 St', city: 'Lagos', state: 'Lagos' },
      })
      .expect(403);

    // Owner creates a restaurant — starts unapproved.
    const createRes = await request(server)
      .post('/restaurants')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Burgundy Kitchen',
        cuisineTypes: ['Nigerian'],
        currency: 'NGN',
        country: 'Nigeria',
        address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
      })
      .expect(201);
    const restaurant = createRes.body as {
      id?: string;
      _id: string;
      slug: string;
      isApproved: boolean;
    };
    const restaurantId = restaurant._id;
    expect(restaurant.slug).toBe('burgundy-kitchen');
    expect(restaurant.isApproved).toBe(false);

    // Not visible in the public listing or by direct slug lookup yet.
    const listBefore = await request(server).get('/restaurants').expect(200);
    expect((listBefore.body as { total: number }).total).toBe(0);
    await request(server).get('/restaurants/burgundy-kitchen').expect(404);

    // A different owner cannot edit it.
    await request(server)
      .patch(`/restaurants/${restaurantId}`)
      .set('Authorization', `Bearer ${otherOwner.accessToken}`)
      .send({ name: 'Hijacked' })
      .expect(403);

    // The owner can edit their own restaurant.
    await request(server)
      .patch(`/restaurants/${restaurantId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ description: 'Home-style Nigerian food' })
      .expect(200);

    // A non-admin cannot approve.
    await request(server)
      .patch(`/restaurants/${restaurantId}/approve`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(403);

    // Admin approves — now it's publicly visible.
    await request(server)
      .patch(`/restaurants/${restaurantId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const listAfter = await request(server).get('/restaurants').expect(200);
    expect((listAfter.body as { total: number }).total).toBe(1);
    const detail = await request(server)
      .get('/restaurants/burgundy-kitchen')
      .expect(200);
    expect((detail.body as { description: string }).description).toBe(
      'Home-style Nigerian food',
    );

    // Menu: owner adds a category and an item.
    const categoryRes = await request(server)
      .post(`/restaurants/${restaurantId}/menu/categories`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Mains' })
      .expect(201);
    const categoryId = (categoryRes.body as { _id: string })._id;

    await request(server)
      .post(`/restaurants/${restaurantId}/menu/items`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ categoryId, name: 'Jollof Rice', price: 12.5 })
      .expect(201);

    // A different owner cannot add menu items to this restaurant.
    await request(server)
      .post(`/restaurants/${restaurantId}/menu/items`)
      .set('Authorization', `Bearer ${otherOwner.accessToken}`)
      .send({ categoryId, name: 'Should Fail', price: 1 })
      .expect(403);

    // Public menu read shows the category with its item nested.
    const menuRes = await request(server)
      .get(`/restaurants/${restaurantId}/menu`)
      .expect(200);
    const menu = menuRes.body as {
      name: string;
      items: { name: string; isAvailable: boolean }[];
    }[];
    expect(menu).toHaveLength(1);
    expect(menu[0].name).toBe('Mains');
    expect(menu[0].items[0].name).toBe('Jollof Rice');
    expect(menu[0].items[0].isAvailable).toBe(true);
  });
});
