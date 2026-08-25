import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

// Called before NestFactory.create() — Sentry's own docs require init() to run as early as
// possible so its instrumentation can hook into Node's runtime before other modules load.
// Skipped entirely (not called with an empty dsn) when unconfigured, same pattern as
// SmsService/LiveDeliveryMap for Termii/Mapbox (docs/ROADMAP.md FDP-22).
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}

async function bootstrap() {
  // rawBody: true — Stripe/Paystack webhook signature verification (payments module) needs the
  // exact bytes received, not a re-serialized copy of the parsed JSON body. Nest stores it
  // alongside the normal parsed body as `req.rawBody`, for every route, with no other change
  // to body parsing.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(Logger));

  setupApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Food Delivery Platform API')
    .setDescription(
      'Technology-driven food ordering and delivery platform connecting customers with restaurants and reliable delivery.',
    )
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
