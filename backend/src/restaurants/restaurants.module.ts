import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Restaurant, RestaurantSchema } from './schemas/restaurant.schema';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsController } from './restaurants.controller';
import { BusinessVerificationModule } from '../business-verification/business-verification.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Restaurant.name, schema: RestaurantSchema },
    ]),
    // Automated CAC/RC check (docs/ROADMAP.md FDP-115) — safe, non-circular, same reasoning
    // payments.module.ts already documents for its own RestaurantsModule import.
    BusinessVerificationModule,
    // The vendor-facing notification runVerification()/autoApproveIfEligible() fire (FDP-115) —
    // unlike BusinessVerificationModule above, this genuinely IS circular:
    // RestaurantsModule -> NotificationsModule -> UsersModule -> RestaurantsModule (UsersService
    // already depends on RestaurantsService, pre-existing). forwardRef() is the standard NestJS
    // fix for a real cross-domain cycle like this — see RestaurantsService's matching
    // `@Inject(forwardRef(...))` on the constructor parameter.
    forwardRef(() => NotificationsModule),
  ],
  controllers: [RestaurantsController],
  providers: [RestaurantsService],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
