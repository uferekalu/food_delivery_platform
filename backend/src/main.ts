import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

async function bootstrap() {
  // rawBody: true — Stripe/Paystack webhook signature verification (payments module) needs the
  // exact bytes received, not a re-serialized copy of the parsed JSON body. Nest stores it
  // alongside the normal parsed body as `req.rawBody`, for every route, with no other change
  // to body parsing.
  const app = await NestFactory.create(AppModule, {
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
