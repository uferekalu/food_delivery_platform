import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
