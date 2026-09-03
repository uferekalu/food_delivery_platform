import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import {
  Restaurant,
  RestaurantSchema,
} from '../restaurants/schemas/restaurant.schema';
import { Store, StoreSchema } from '../stores/schemas/store.schema';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [
    // Registered independently from AuthModule's identical JwtModule — see RealtimeGateway's
    // doc comment for why this module can't depend on OrdersModule/AuthModule without creating
    // a cycle (OrdersModule depends on this module to emit events).
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Restaurant.name, schema: RestaurantSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
  ],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
