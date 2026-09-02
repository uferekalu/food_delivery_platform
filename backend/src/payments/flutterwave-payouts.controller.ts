import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PLATFORM_COMMISSION_RATE } from '../common/constants/platform-fee';
import { FlutterwaveAdapter } from './adapters/flutterwave.adapter';
import { ResolveFlutterwaveAccountDto } from './dto/resolve-flutterwave-account.dto';

/**
 * Vendor payouts epic, part 3 of 4 (docs/ROADMAP.md FDP-53) — Flutterwave-specific onboarding,
 * mirroring PaystackPayoutsController's shape (FDP-52) exactly. Lives in PaymentsModule (owns
 * FlutterwaveAdapter) rather than RestaurantsModule, but the routes are namespaced under
 * `/restaurants/:restaurantId/...` since that's what they're conceptually about.
 */
@ApiTags('payments')
@Controller()
export class FlutterwavePayoutsController {
  private readonly logger = new Logger(FlutterwavePayoutsController.name);

  constructor(
    private readonly flutterwaveAdapter: FlutterwaveAdapter,
    private readonly restaurantsService: RestaurantsService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Same reasoning as PaystackPayoutsController.callPaystack — a raw adapter error must never
   * surface as an opaque 500. */
  private async callFlutterwave<T>(
    action: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.logger.error(`Flutterwave ${action} failed`, error);
      const message =
        error instanceof Error ? error.message : 'Flutterwave error';
      throw new BadRequestException(message);
    }
  }

  /** Not restaurant-scoped — the bank list is the same for everyone, just proxied through our
   * backend so the frontend never needs a Flutterwave key of its own. */
  @Get('payments/flutterwave/banks')
  listBanks() {
    return this.callFlutterwave('list banks', () =>
      this.flutterwaveAdapter.listBanks(),
    );
  }

  // Same throttle budget as the Paystack equivalent (backend/CLAUDE.md's app-wide 100/min
  // default is too loose for calls that reach out to a provider on the restaurant's behalf).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Roles('restaurant_owner', 'admin')
  @Post('restaurants/:restaurantId/payout/flutterwave/resolve-account')
  async resolveAccount(
    @CurrentUser() user: AccessTokenPayload,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: ResolveFlutterwaveAccountDto,
  ) {
    const restaurant =
      await this.restaurantsService.findByIdOrThrow(restaurantId);
    this.restaurantsService.assertOwnerOrAdmin(restaurant, user);

    return this.callFlutterwave('resolve account', () =>
      this.flutterwaveAdapter.resolveAccount(dto.accountNumber, dto.bankCode),
    );
  }

  /**
   * Re-resolves the account server-side rather than trusting a prior `resolve-account` call,
   * same reasoning as Paystack's setup. `businessEmail` comes from the restaurant owner's own
   * account — there's no restaurant-level email field, and Flutterwave's subaccount API
   * requires one.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Roles('restaurant_owner', 'admin')
  @Post('restaurants/:restaurantId/payout/flutterwave/setup')
  async setup(
    @CurrentUser() user: AccessTokenPayload,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: ResolveFlutterwaveAccountDto,
  ) {
    const restaurant =
      await this.restaurantsService.findByIdOrThrow(restaurantId);
    this.restaurantsService.assertOwnerOrAdmin(restaurant, user);

    const owner = await this.usersService.findById(
      restaurant.ownerId.toString(),
    );
    if (!owner) {
      throw new BadRequestException("Could not find this restaurant's owner");
    }

    const hadActiveAccount = restaurant.payoutAccounts.some(
      (account) =>
        account.provider === 'flutterwave' && account.status === 'active',
    );

    const resolved = await this.callFlutterwave('resolve account', () =>
      this.flutterwaveAdapter.resolveAccount(dto.accountNumber, dto.bankCode),
    );
    const { subaccountId } = await this.callFlutterwave(
      'create subaccount',
      () =>
        this.flutterwaveAdapter.createSubaccount({
          businessName: restaurant.name,
          businessEmail: owner.email,
          bankCode: dto.bankCode,
          accountNumber: dto.accountNumber,
          splitValue: PLATFORM_COMMISSION_RATE,
        }),
    );

    const updated = await this.restaurantsService.setPayoutAccount(
      restaurantId,
      user,
      'flutterwave',
      'active',
      subaccountId,
    );

    this.notifyPayoutAccountChanged(updated, hadActiveAccount);

    return {
      restaurant: updated,
      verifiedAccountName: resolved.accountName,
    };
  }

  /** Same fraud-detection reasoning as PaystackPayoutsController's notification. */
  private notifyPayoutAccountChanged(
    restaurant: { _id: unknown; ownerId: unknown; name: string },
    wasReplacement: boolean,
  ): void {
    const action = wasReplacement
      ? 'changed to a new bank account'
      : 'connected for the first time';
    const body = `The Flutterwave payout account for ${restaurant.name} was just ${action}. Future orders will settle to this account. If you didn't make this change, contact support immediately.`;
    this.notificationsService
      .notify({
        userId: String(restaurant.ownerId),
        type: 'payout_account_changed',
        title: 'Payout account updated',
        body,
        metadata: {
          restaurantId: String(restaurant._id),
          provider: 'flutterwave',
        },
        email: {
          subject: `Payout account updated — ${restaurant.name}`,
          html: `<p>${body}</p>`,
        },
      })
      .catch((err: Error) =>
        this.logger.error(
          `Payout-change notification failed for restaurant ${String(restaurant._id)}: ${err.message}`,
        ),
      );
  }
}
