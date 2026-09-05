import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Payout, PayoutSchema } from './schemas/payout.schema';
import {
  Restaurant,
  RestaurantSchema,
} from '../restaurants/schemas/restaurant.schema';
import { Store, StoreSchema } from '../stores/schemas/store.schema';
import { Rider, RiderSchema } from '../riders/schemas/rider.schema';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { PayoutsService } from './payouts.service';
import { PayoutExecutionService } from './payout-execution.service';
import { PayoutSchedulerService } from './payout-scheduler.service';
import { PayoutsController } from './payouts.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Payout.name, schema: PayoutSchema },
      // Restaurant/Store/Rider are registered directly here (read-only access to their
      // `payoutAccounts`), not via their own feature modules — same "inject the model, not the
      // whole domain service" pattern PayoutsService already uses for Order, and it keeps this
      // module's dependency graph flat rather than pulling in RidersModule's own OrdersModule
      // import chain for something this module only ever reads.
      { name: Restaurant.name, schema: RestaurantSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Rider.name, schema: RiderSchema },
    ]),
    // PaymentsModule exports the three provider adapters (docs/ROADMAP.md FDP-92) so real
    // transfer execution reuses the same clients checkout already uses, rather than
    // instantiating a second redundant set. NotificationsModule/UsersModule back the
    // success/failure/reconciliation-needed alerts PayoutExecutionService sends. None of these
    // three modules (or anything they import) depends on PayoutsModule, so this is safely
    // non-circular.
    PaymentsModule,
    NotificationsModule,
    UsersModule,
  ],
  controllers: [PayoutsController],
  providers: [PayoutsService, PayoutExecutionService, PayoutSchedulerService],
  exports: [PayoutsService, PayoutExecutionService],
})
export class PayoutsModule {}
