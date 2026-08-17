/* eslint-disable @typescript-eslint/no-require-imports -- see health.e2e-spec.ts for why AppModule can't be a static import here */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setupApp } from '../src/setup-app';

jest.setTimeout(30_000);

interface AuthResponseBody {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    isEmailVerified: boolean;
  };
  accessToken: string;
}

function extractCookie(
  setCookieHeader: string[] | undefined,
  name: string,
): string {
  const raw = setCookieHeader?.find((c) => c.startsWith(`${name}=`));
  if (!raw) throw new Error(`Expected a Set-Cookie header for ${name}`);
  return raw.split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let mongod: MongoMemoryServer;
  let sendVerificationEmail: jest.Mock;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
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

    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');
    const { MailService } =
      require('../src/mail/mail.service') as typeof import('../src/mail/mail.service');

    sendVerificationEmail = jest.fn().mockResolvedValue(undefined);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendVerificationEmail,
        sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    await mongod.stop();
  });

  const credentials = {
    email: 'jane@example.com',
    password: 'Str0ngPass1',
    name: 'Jane Doe',
  };

  it('rejects registration with a weak password', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...credentials, password: 'weak' })
      .expect(400);
  });

  it('registers, logs the user in via the returned access token, refreshes, and logs out', async () => {
    const server = app.getHttpServer();

    const registerRes = await request(server)
      .post('/auth/register')
      .send(credentials)
      .expect(201);
    const registerBody = registerRes.body as AuthResponseBody;
    expect(registerBody.user.email).toBe(credentials.email);
    expect(registerBody.user.isEmailVerified).toBe(false);
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      credentials.email,
      expect.stringContaining('/verify-email?token='),
    );

    const refreshCookie = extractCookie(
      registerRes.headers['set-cookie'] as unknown as string[],
      'refresh_token',
    );

    // A registered-but-unverified user can still reach a protected endpoint with their access token.
    const meRes = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${registerBody.accessToken}`)
      .expect(200);
    expect((meRes.body as AuthResponseBody['user']).email).toBe(
      credentials.email,
    );

    // No token at all is rejected.
    await request(server).get('/auth/me').expect(401);

    // Duplicate registration is rejected.
    await request(server).post('/auth/register').send(credentials).expect(409);

    // Wrong password is rejected without revealing which field was wrong.
    await request(server)
      .post('/auth/login')
      .send({ email: credentials.email, password: 'WrongPass1' })
      .expect(401);

    // Refresh rotates the cookie and returns a new access token.
    const refreshRes = await request(server)
      .post('/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);
    const newRefreshCookie = extractCookie(
      refreshRes.headers['set-cookie'] as unknown as string[],
      'refresh_token',
    );
    expect(newRefreshCookie).not.toBe(refreshCookie);

    // Replaying the original (now-rotated) refresh token is rejected — reuse detection.
    await request(server)
      .post('/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(401);
    // ...and the reuse response above should have revoked the whole family, including the token
    // that replaced it.
    await request(server)
      .post('/auth/refresh')
      .set('Cookie', newRefreshCookie)
      .expect(401);

    // Logging in fresh gets a working session again.
    const loginRes = await request(server)
      .post('/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    const loginCookie = extractCookie(
      loginRes.headers['set-cookie'] as unknown as string[],
      'refresh_token',
    );

    await request(server)
      .post('/auth/logout')
      .set('Cookie', loginCookie)
      .expect(204);

    // The logged-out refresh token can no longer be used.
    await request(server)
      .post('/auth/refresh')
      .set('Cookie', loginCookie)
      .expect(401);
  });
});
