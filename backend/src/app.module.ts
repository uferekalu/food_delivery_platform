import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { envValidationSchema } from './common/config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { UploadsModule } from './uploads/uploads.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { MenuModule } from './menu/menu.module';
import { CartModule } from './cart/cart.module';
import { PromoCodesModule } from './promo-codes/promo-codes.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { DeliveryZonesModule } from './delivery-zones/delivery-zones.module';
import { RidersModule } from './riders/riders.module';
import { ReviewsModule } from './reviews/reviews.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          // 'test' is silent on purpose: every e2e/HTTP-hitting test logs a full request/
          // response line otherwise, and that noise makes a genuine failure harder to spot
          // as more e2e suites accumulate (first noticed once there were 3 of them).
          level:
            config.get('NODE_ENV') === 'production'
              ? 'info'
              : config.get('NODE_ENV') === 'test'
                ? 'silent'
                : 'debug',
          // pino-pretty spawns a worker thread — only safe under a real dev server. Under
          // Jest (NODE_ENV=test) a worker-thread transport is a known hang source, since
          // Jest waits on open handles that never close; production wants raw JSON anyway.
          transport:
            config.get('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    HealthModule,
    UsersModule,
    AuthModule,
    UploadsModule,
    RestaurantsModule,
    MenuModule,
    CartModule,
    PromoCodesModule,
    OrdersModule,
    PaymentsModule,
    DeliveryZonesModule,
    RidersModule,
    ReviewsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
