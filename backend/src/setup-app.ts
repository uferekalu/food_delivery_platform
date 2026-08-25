import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Applies every app-wide concern that isn't specific to actually listening on a port (Swagger
 * setup and `app.listen()` stay in main.ts). Called from both `main.ts` and every e2e test's
 * `beforeAll` — e2e tests build the app via `Test.createTestingModule(...).createNestApplication()`
 * directly, which does NOT run `main.ts`'s `bootstrap()`, so without this shared helper tests
 * would silently run with no validation pipe, no exception filter, and no cookie parsing.
 */
export function setupApp(app: INestApplication): void {
  // Render/Vercel (and any reverse proxy) sit in front of this app — without this, Express's
  // `req.ip` resolves to the proxy's own address for every request, which would make
  // `ThrottlerGuard`'s per-IP rate limiting effectively rate-limit the whole app as a single
  // client (docs/ROADMAP.md FDP-22 security review). `1` trusts exactly one hop, matching a
  // single reverse proxy in front — not `true`, which would trust the whole chain including a
  // client-spoofable `X-Forwarded-For`. Cast needed since `Test.createTestingModule(...)
  // .createNestApplication()` (every e2e spec) returns the generic `INestApplication`, not the
  // Express-specific subtype `.set()` lives on — but the underlying HTTP adapter is always
  // Express in this app (`@nestjs/platform-express`), so the cast is safe.
  (app as NestExpressApplication).set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());

  const config = app.get(ConfigService);
  const corsOrigins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
