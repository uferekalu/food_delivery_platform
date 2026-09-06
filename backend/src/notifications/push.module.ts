import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PushSubscription,
  PushSubscriptionSchema,
} from './schemas/push-subscription.schema';
import { PushService } from './push.service';

/**
 * Split out from NotificationsModule the same way SmsModule already is (see its own doc
 * comment) — keeps PushService reachable without pulling in RealtimeModule's own module graph,
 * even though nothing outside NotificationsModule needs it yet.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PushSubscription.name, schema: PushSubscriptionSchema },
    ]),
  ],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
