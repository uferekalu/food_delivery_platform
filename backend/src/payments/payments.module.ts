import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { PaymentProviderResolver } from './provider-resolver';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaystackPayoutsController } from './paystack-payouts.controller';
import { FlutterwavePayoutsController } from './flutterwave-payouts.controller';
import { StripePayoutsController } from './stripe-payouts.controller';
import { StripeAdapter } from './adapters/stripe.adapter';
import { PaystackAdapter } from './adapters/paystack.adapter';
import { FlutterwaveAdapter } from './adapters/flutterwave.adapter';

@Module({
  // OrdersModule, never the reverse — OrdersModule already owns its own independent
  // PaymentProviderResolver instance for order-creation-time defaulting (see
  // orders.module.ts); that stateless class is provided separately in both modules rather than
  // shared, specifically to avoid OrdersModule <-> PaymentsModule becoming circular.
  // RestaurantsModule is a safe (non-circular) addition — it imports nothing itself, unlike
  // OrdersModule — needed directly here (not just transitively via OrdersModule) for the
  // vendor-payouts epic's onboarding endpoints (docs/ROADMAP.md FDP-51 onward). NotificationsModule
  // is likewise safe (imports RealtimeModule, which imports nothing back toward Payments) —
  // used to email a restaurant owner whenever their payout account changes, so a compromised
  // account silently redirecting future payouts doesn't go unnoticed (docs/ROADMAP.md FDP-58).
  // UsersModule (imports only RestaurantsModule, also non-circular) is needed by
  // FlutterwavePayoutsController — Flutterwave's subaccount API requires a business email, and
  // there's no restaurant-level email field, only the owning user's (docs/ROADMAP.md FDP-53).
  imports: [OrdersModule, RestaurantsModule, NotificationsModule, UsersModule],
  controllers: [
    PaymentsController,
    PaystackPayoutsController,
    FlutterwavePayoutsController,
    StripePayoutsController,
  ],
  providers: [
    PaymentsService,
    PaymentProviderResolver,
    StripeAdapter,
    PaystackAdapter,
    FlutterwaveAdapter,
  ],
  // The three adapters are exported (docs/ROADMAP.md FDP-92) so PayoutsModule can reuse them for
  // real transfer execution rather than instantiating a second, redundant set of provider clients
  // — safe to import PaymentsModule from PayoutsModule since nothing PaymentsModule imports
  // (OrdersModule, RestaurantsModule, NotificationsModule, UsersModule) depends on PayoutsModule.
  exports: [StripeAdapter, PaystackAdapter, FlutterwaveAdapter],
})
export class PaymentsModule {}
