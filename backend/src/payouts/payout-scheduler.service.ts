import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PayoutExecutionService } from './payout-execution.service';

// `@nestjs/schedule`'s CronExpression enum has no "every Monday at midnight" constant (only
// weekday-range/business-hours presets) — confirmed by listing its keys — so this is a literal
// cron string: minute=0, hour=0, every day-of-month, every month, day-of-week=1 (Monday).
const WEEKLY_MONDAY_MIDNIGHT = '0 0 * * 1';

/**
 * Weekly payout execution (docs/ROADMAP.md FDP-92) — the platform's explicit requirement is
 * "every Monday". Runs at 00:00 UTC rather than relying on the deploy container's local
 * timezone, which is never guaranteed across environments (and Railway's containers run UTC by
 * default anyway) — pinned explicitly so this can never silently drift onto the wrong day if
 * that ever changes. See `PayoutExecutionService` for the actual money-movement logic and its
 * safety guarantees; this class is only the trigger.
 */
@Injectable()
export class PayoutSchedulerService {
  private readonly logger = new Logger(PayoutSchedulerService.name);

  constructor(
    private readonly payoutExecutionService: PayoutExecutionService,
  ) {}

  @Cron(WEEKLY_MONDAY_MIDNIGHT, { timeZone: 'UTC' })
  async handleWeeklyPayoutRun(): Promise<void> {
    this.logger.log('Starting scheduled weekly payout batch');
    try {
      await this.payoutExecutionService.runWeeklyBatch();
    } catch (error) {
      // runWeeklyBatch already catches per-vendor errors internally — reaching here means
      // something broke at a level above any single vendor (e.g. the initial Restaurant/Store/
      // Rider queries themselves). Logged, not rethrown: an uncaught exception from a @Cron
      // handler has nowhere useful to go.
      this.logger.error('Weekly payout batch failed unexpectedly', error);
    }
  }
}
