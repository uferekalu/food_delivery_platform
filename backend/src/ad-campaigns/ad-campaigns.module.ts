import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdCampaign, AdCampaignSchema } from './schemas/ad-campaign.schema';
import { AdCampaignsService } from './ad-campaigns.service';
import { AdCampaignsController } from './ad-campaigns.controller';
import { AdCampaignSchedulerService } from './ad-campaign-scheduler.service';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { StoresModule } from '../stores/stores.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentProviderResolver } from '../payments/provider-resolver';

@Module({
  // RestaurantsModule/StoresModule/NotificationsModule are all safe, non-circular plain imports
  // here — the exact same shape PaymentsModule itself already uses for the same three modules
  // (see payments.module.ts's own doc comment for the full reasoning), since none of the three
  // import anything back toward this module. PaymentsModule is imported for its exported
  // Stripe/Paystack/Flutterwave adapters (docs/ROADMAP.md FDP-92's export, reused by PayoutsModule
  // the same way) rather than re-instantiating a second, redundant set of provider clients.
  // PaymentProviderResolver is NOT exported by PaymentsModule, so — same reasoning OrdersModule
  // already documents for its own independent instance — it's provided fresh here too; it's a
  // stateless class with no constructor dependencies, so a second instance costs nothing and
  // keeps this module decoupled from PaymentsModule's own resolver instance.
  //
  // IMPORTANT: none of RestaurantsModule/StoresModule/NotificationsModule may ever import this
  // module back — doing so would reopen the exact circular-dependency class that once crashed
  // production (docs/ARCHITECTURE.md §38/§46).
  imports: [
    MongooseModule.forFeature([
      { name: AdCampaign.name, schema: AdCampaignSchema },
    ]),
    RestaurantsModule,
    StoresModule,
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [AdCampaignsController],
  providers: [
    AdCampaignsService,
    AdCampaignSchedulerService,
    PaymentProviderResolver,
  ],
})
export class AdCampaignsModule {}
