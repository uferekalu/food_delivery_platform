import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';

/**
 * Split out from NotificationsModule so AuthModule (docs/ROADMAP.md FDP-41, phone OTP) can use
 * SmsService too, without importing all of NotificationsModule — which pulls in RealtimeModule,
 * which itself imports AuthModule, so that path would be a circular module dependency.
 * SmsService has no dependencies of its own beyond ConfigService, so this module is safe for
 * anything to import directly.
 */
@Module({
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
