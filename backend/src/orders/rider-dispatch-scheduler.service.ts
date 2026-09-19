import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

/**
 * Grace-period sweep (docs/ROADMAP.md FDP-133) — the automatic nearest-rider dispatch that used
 * to fire the instant an order went READY_FOR_PICKUP now waits for the seller to act first (see
 * `OrdersService.assignRiderByOwner`); this is what still guarantees an order the seller never
 * gets to eventually gets a rider anyway. Runs every minute — frequent enough that the grace
 * period (`RIDER_ASSIGNMENT_GRACE_PERIOD_MS`) is enforced close to exactly, cheap enough that an
 * indexed `readyForPickupAt` query every 60s is a non-issue, mirroring
 * `AdCampaignSchedulerService`'s/`PayoutSchedulerService`'s exact "thin trigger, real logic lives
 * in the owning service" shape.
 */
@Injectable()
export class RiderDispatchSchedulerService {
  private readonly logger = new Logger(RiderDispatchSchedulerService.name);

  constructor(private readonly ordersService: OrdersService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleGracePeriodSweep(): Promise<void> {
    try {
      const { dispatched, checked } =
        await this.ordersService.autoDispatchStaleReadyOrders();
      if (checked > 0) {
        this.logger.log(
          `Rider grace-period sweep: ${dispatched}/${checked} stale READY_FOR_PICKUP order(s) auto-dispatched`,
        );
      }
    } catch (error) {
      this.logger.error('Rider grace-period sweep failed unexpectedly', error);
    }
  }
}
