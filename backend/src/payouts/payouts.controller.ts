import { Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../auth/decorators/roles.decorator';
import { PayoutExecutionService } from './payout-execution.service';

/**
 * Weekly payout execution (docs/ROADMAP.md FDP-92). Just the manual admin trigger for now — a
 * full payout listing/dashboard endpoint is FDP-93. Tightly throttled: this is an expensive
 * operation that moves real money across every onboarded vendor/rider, not something that should
 * ever be spammable even by an admin.
 */
@ApiTags('payouts')
@Controller('payouts')
export class PayoutsController {
  constructor(
    private readonly payoutExecutionService: PayoutExecutionService,
  ) {}

  /** Runs the same batch the Monday cron runs — useful for verifying the pipeline works without
   * waiting a week, and for re-running after a vendor's payout account issue has been fixed
   * rather than waiting for the next scheduled Monday. */
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Roles('admin')
  @Post('run-weekly-batch')
  runWeeklyBatch() {
    return this.payoutExecutionService.runWeeklyBatch();
  }
}
