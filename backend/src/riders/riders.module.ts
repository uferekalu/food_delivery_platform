import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { OrdersModule } from '../orders/orders.module';
import { Rider, RiderSchema } from './schemas/rider.schema';
import { RidersService } from './riders.service';
import { RidersController } from './riders.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Rider.name, schema: RiderSchema }]),
    UsersModule,
    OrdersModule,
  ],
  controllers: [RidersController],
  providers: [RidersService],
  exports: [RidersService],
})
export class RidersModule {}
