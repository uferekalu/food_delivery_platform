import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StoresService } from '../stores/stores.service';
import { RidersService } from '../riders/riders.service';
import { PayoutExecutionService } from './payout-execution.service';
import { ListPayoutsDto } from './dto/list-payouts.dto';
import { ResolveReconciliationDto } from './dto/resolve-reconciliation.dto';

/**
 * Weekly payout execution (docs/ROADMAP.md FDP-92) + dashboards (FDP-93). The manual admin
 * trigger and the dashboard/reconciliation endpoints both live here — this module owns the
 * `Payout` collection's write path (via `PayoutExecutionService`), so its own controller is the
 * natural home for reading it back too, same as every other domain in this codebase.
 */
@ApiTags('payouts')
@Controller('payouts')
export class PayoutsController {
  constructor(
    private readonly payoutExecutionService: PayoutExecutionService,
    private readonly restaurantsService: RestaurantsService,
    private readonly storesService: StoresService,
    private readonly ridersService: RidersService,
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

  /** The admin payout dashboard — every payout, across every vendor/rider, optionally filtered. */
  @Roles('admin')
  @Get()
  listAll(@Query() query: ListPayoutsDto) {
    return this.payoutExecutionService.listAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      vendorType: query.vendorType,
      reconciliationRequired: query.reconciliationRequired,
    });
  }

  /** A restaurant owner's own payout history for one of their restaurants. */
  @Roles('restaurant_owner', 'admin')
  @Get('restaurants/:restaurantId')
  async listForRestaurant(
    @CurrentUser() user: AccessTokenPayload,
    @Param('restaurantId') restaurantId: string,
    @Query() query: ListPayoutsDto,
  ) {
    const restaurant =
      await this.restaurantsService.findByIdOrThrow(restaurantId);
    this.restaurantsService.assertOwnerOrAdmin(restaurant, user);
    return this.payoutExecutionService.listForVendor(
      'restaurant',
      restaurantId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  /** A store owner's own payout history for one of their stores. */
  @Roles('restaurant_owner', 'admin')
  @Get('stores/:storeId')
  async listForStore(
    @CurrentUser() user: AccessTokenPayload,
    @Param('storeId') storeId: string,
    @Query() query: ListPayoutsDto,
  ) {
    const store = await this.storesService.findByIdOrThrow(storeId);
    this.storesService.assertOwnerOrAdmin(store, user);
    return this.payoutExecutionService.listForVendor(
      'store',
      storeId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  /** A rider's own payout history — `Payout.vendorId` for a rider is the Rider *document* id,
   * not the User id, so this resolves the caller's own rider profile first (same as every other
   * rider "me" endpoint) rather than taking an id param. */
  @Roles('rider', 'admin')
  @Get('riders/me')
  async listForMyRiderProfile(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListPayoutsDto,
  ) {
    const rider = await this.ridersService.findMine(user.sub);
    return this.payoutExecutionService.listForVendor(
      'rider',
      rider._id.toString(),
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  /** Admin's manual close-out for a payout flagged `reconciliationRequired` — see
   * `PayoutExecutionService.resolveReconciliation`'s doc comment for the two outcomes. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Roles('admin')
  @Patch(':id/resolve-reconciliation')
  resolveReconciliation(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: ResolveReconciliationDto,
  ) {
    return this.payoutExecutionService.resolveReconciliation(
      id,
      user.sub,
      dto.transferActuallySucceeded,
    );
  }
}
