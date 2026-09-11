import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdCampaignsService } from './ad-campaigns.service';

/**
 * Daily lifecycle sweep (docs/ROADMAP.md FDP-124) — activates scheduled->active campaigns whose
 * startDate arrived and ends active->ended ones whose endDate passed, mirroring
 * PayoutSchedulerService's exact pattern (the only other cron job in this codebase). Daily
 * granularity is consistent with this app's existing "eventually consistent, batch-driven"
 * payout philosophy rather than real-time — the payment-webhook path already activates a
 * same-day campaign immediately (see AdCampaignsService.markPaid), so this sweep's only real
 * job on the activation side is a same-day-miss/future-start-date safety net; on the ending
 * side, it's the sole mechanism (worst-case staleness window: just under 24h between a
 * campaign's endDate and this sweep clearing its sponsorship).
 */
@Injectable()
export class AdCampaignSchedulerService {
  private readonly logger = new Logger(AdCampaignSchedulerService.name);

  constructor(private readonly adCampaignsService: AdCampaignsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'UTC' })
  async handleDailyLifecycleSweep(): Promise<void> {
    this.logger.log('Starting scheduled ad-campaign lifecycle sweep');
    try {
      const result = await this.adCampaignsService.runLifecycleSweep();
      this.logger.log(
        `Ad-campaign lifecycle sweep done: ${result.activated} activated, ${result.ended} ended`,
      );
    } catch (error) {
      this.logger.error(
        'Ad-campaign lifecycle sweep failed unexpectedly',
        error,
      );
    }
  }
}
