import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { RidersModule } from '../riders/riders.module';
import { UsersModule } from '../users/users.module';
import { MenuModule } from '../menu/menu.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  // MenuModule is a safe (non-circular) addition — it imports RestaurantsModule, not the other
  // way around, so AdminModule importing both is a diamond, not a cycle. Needed here (rather
  // than inside RestaurantsModule itself) so restaurant approval can require a non-empty menu
  // without RestaurantsModule <-> MenuModule becoming circular (docs/ROADMAP.md FDP-60).
  imports: [
    OrdersModule,
    RestaurantsModule,
    RidersModule,
    UsersModule,
    MenuModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
