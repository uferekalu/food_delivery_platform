import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { PaymentProviderResolver } from './provider-resolver';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaystackPayoutsController } from './paystack-payouts.controller';
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
  // vendor-payouts epic's onboarding endpoints (docs/ROADMAP.md FDP-51 onward).
  imports: [OrdersModule, RestaurantsModule],
  controllers: [PaymentsController, PaystackPayoutsController],
  providers: [
    PaymentsService,
    PaymentProviderResolver,
    StripeAdapter,
    PaystackAdapter,
    FlutterwaveAdapter,
  ],
})
export class PaymentsModule {}
