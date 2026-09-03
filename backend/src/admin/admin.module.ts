import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { RidersModule } from '../riders/riders.module';
import { UsersModule } from '../users/users.module';
import { MenuModule } from '../menu/menu.module';
import { StoresModule } from '../stores/stores.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  // MenuModule/StoresModule are safe (non-circular) additions — each imports RestaurantsModule
  // or stands alone, not the other way around, so AdminModule importing all of them is a
  // diamond, not a cycle. Needed here so restaurant/store approval can require a non-empty
  // menu/catalog without RestaurantsModule/StoresModule <-> MenuModule/ProductsModule becoming
  // circular (docs/ROADMAP.md FDP-60/FDP-56).
  imports: [
    OrdersModule,
    RestaurantsModule,
    RidersModule,
    UsersModule,
    MenuModule,
    StoresModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
