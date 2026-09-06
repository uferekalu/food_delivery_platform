import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CartModule } from '../cart/cart.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { StoresModule } from '../stores/stores.module';
import { MenuItem, MenuItemSchema } from '../menu/schemas/menu-item.schema';
import { Product, ProductSchema } from '../stores/schemas/product.schema';
import { Rider, RiderSchema } from '../riders/schemas/rider.schema';
import { PromoCodesModule } from '../promo-codes/promo-codes.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { DeliveryZonesModule } from '../delivery-zones/delivery-zones.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { Order, OrderSchema } from './schemas/order.schema';
import {
  PayoutClawback,
  PayoutClawbackSchema,
} from '../payouts/schemas/payout-clawback.schema';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PaymentProviderResolver } from '../payments/provider-resolver';
import { TaxResolver } from './tax-resolver';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: Product.name, schema: ProductSchema },
      // Nearest-rider dispatch (docs/ROADMAP.md FDP-98) queries riders directly via this model,
      // not `RidersService` — `RidersModule` already depends on this module (self-assign calls
      // `OrdersService.assignToRider`), so importing `RidersModule` here would be circular.
      { name: Rider.name, schema: RiderSchema },
      // Refund-hardening pass (docs/ROADMAP.md FDP-104) — the write side of the clawback ledger
      // (a refund on an already-paid-out order creates one, see OrdersService.finalizeRefund).
      // Registered directly here rather than importing PayoutsModule, the same "reuse the schema,
      // not the owning module" pattern PayoutsModule itself already uses for Order — importing
      // PayoutsModule here would be circular (PayoutsModule already imports PaymentsModule, which
      // imports this module).
      { name: PayoutClawback.name, schema: PayoutClawbackSchema },
    ]),
    CartModule,
    RestaurantsModule,
    StoresModule,
    PromoCodesModule,
    RealtimeModule,
    DeliveryZonesModule,
    NotificationsModule,
    // Refund-hardening pass (docs/ROADMAP.md FDP-104) — fanning out an admin notification when a
    // clawback is created or a refund needs manual reconciliation, same pattern
    // PayoutExecutionService.notifyAdmins already uses. Safe, non-circular (UsersModule only
    // imports RestaurantsModule, per PaymentsModule's own note on this).
    UsersModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PaymentProviderResolver, TaxResolver],
  exports: [OrdersService],
})
export class OrdersModule {}
