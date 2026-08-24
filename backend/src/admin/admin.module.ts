import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { RidersModule } from '../riders/riders.module';
import { UsersModule } from '../users/users.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [OrdersModule, RestaurantsModule, RidersModule, UsersModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
