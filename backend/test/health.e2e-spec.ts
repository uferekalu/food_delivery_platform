/* eslint-disable @typescript-eslint/no-require-imports -- deliberate CJS require() below, see comment before the describe block */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setupApp } from '../src/setup-app';
// AppModule is intentionally NOT statically imported: its `@Module` decorator calls
// `ConfigModule.forRoot()`, which reads `process.env` the moment the module is evaluated. A
// static `import` is hoisted and resolved before `beforeAll` runs, so it would validate env
// vars that haven't been set yet. Loading it via `require()` inside `beforeAll`, after setting
// them below, defers that evaluation — a real dynamic `import()` doesn't work here because
// this project's `"module": "nodenext"` keeps it as a genuine ESM import even under ts-jest's
// CommonJS test runtime, which throws without `--experimental-vm-modules`.

interface HealthResponseBody {
  status: string;
  info?: { mongodb?: { status: string } };
}

describe('Health (e2e)', () => {
  let app: INestApplication<App>;
  let mongod: MongoMemoryServer;

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
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
    // Cold-starting the in-memory MongoDB binary can comfortably exceed Jest's 5s default.
  }, 30_000);

  afterAll(async () => {
    // `app` may be unset if beforeAll threw before assigning it — still tear down mongod.
    if (app) await app.close();
    await mongod.stop();
  });

  it('GET /health reports ok when MongoDB is reachable', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    const body = response.body as HealthResponseBody;
    expect(body.status).toBe('ok');
    expect(body.info?.mongodb?.status).toBe('up');
  });
});
