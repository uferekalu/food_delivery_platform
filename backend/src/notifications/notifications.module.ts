import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { RealtimeModule } from '../realtime/realtime.module';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { SmsModule } from './sms.module';
import { PushModule } from './push.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
    // forwardRef (docs/ROADMAP.md FDP-115) — the third edge of a real production-crashing cycle:
    // RestaurantsModule -> NotificationsModule -> UsersModule -> RestaurantsModule. The other two
    // edges already use forwardRef (see RestaurantsModule/UsersModule's matching comments), but
    // Jest's flat per-spec TestingModules never actually require the full compiled module graph
    // the way `dist/src/main.js` does at real boot, so this third edge's break only surfaced as a
    // live Railway crash ("UndefinedModuleException: NotificationsModule imports[1] is
    // undefined"), not in any unit test. All three edges now forwardRef both the module import
    // and the constructor injection, since which edge actually breaks is order-dependent on how
    // Node happens to require these files first — not safely assumable from test behavior alone.
    forwardRef(() => UsersModule),
    MailModule,
    RealtimeModule,
    SmsModule,
    PushModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
