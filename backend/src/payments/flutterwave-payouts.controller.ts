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
import { StoresService } from '../stores/stores.service';
import { RidersService } from '../riders/riders.service';
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
 *
 * Extended to stores and riders in docs/ROADMAP.md FDP-94 — see
 * `PaystackPayoutsController`'s class doc comment for the shared reasoning (store routes mirror
 * restaurant ones exactly; riders are self-service only via `/riders/me/...`).
 */
@ApiTags('payments')
@Controller()
export class FlutterwavePayoutsController {
  private readonly logger = new Logger(FlutterwavePayoutsController.name);

  constructor(
    private readonly flutterwaveAdapter: FlutterwaveAdapter,
    private readonly restaurantsService: RestaurantsService,
    private readonly storesService: StoresService,
    private readonly ridersService: RidersService,
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
      { bankCode: dto.bankCode, accountNumber: dto.accountNumber },
    );

    this.notifyPayoutAccountChanged(
      String(updated.ownerId),
      updated.name,
      restaurantId,
      hadActiveAccount,
    );

    return {
      restaurant: updated,
      verifiedAccountName: resolved.accountName,
    };
  }

  /** Store counterpart of `resolveAccount` (docs/ROADMAP.md FDP-94) — identical reasoning. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Roles('restaurant_owner', 'admin')
  @Post('stores/:storeId/payout/flutterwave/resolve-account')
  async resolveStoreAccount(
    @CurrentUser() user: AccessTokenPayload,
    @Param('storeId') storeId: string,
    @Body() dto: ResolveFlutterwaveAccountDto,
  ) {
    const store = await this.storesService.findByIdOrThrow(storeId);
    this.storesService.assertOwnerOrAdmin(store, user);

    return this.callFlutterwave('resolve account', () =>
      this.flutterwaveAdapter.resolveAccount(dto.accountNumber, dto.bankCode),
    );
  }

  /** Store counterpart of `setup` (docs/ROADMAP.md FDP-94) — identical reasoning. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Roles('restaurant_owner', 'admin')
  @Post('stores/:storeId/payout/flutterwave/setup')
  async setupStore(
    @CurrentUser() user: AccessTokenPayload,
    @Param('storeId') storeId: string,
    @Body() dto: ResolveFlutterwaveAccountDto,
  ) {
    const store = await this.storesService.findByIdOrThrow(storeId);
    this.storesService.assertOwnerOrAdmin(store, user);

    const owner = await this.usersService.findById(store.ownerId.toString());
    if (!owner) {
      throw new BadRequestException("Could not find this store's owner");
    }

    const hadActiveAccount = store.payoutAccounts.some(
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
          businessName: store.name,
          businessEmail: owner.email,
          bankCode: dto.bankCode,
          accountNumber: dto.accountNumber,
          splitValue: PLATFORM_COMMISSION_RATE,
        }),
    );

    const updated = await this.storesService.setPayoutAccount(
      storeId,
      user,
      'flutterwave',
      'active',
      subaccountId,
      { bankCode: dto.bankCode, accountNumber: dto.accountNumber },
    );

    this.notifyPayoutAccountChanged(
      String(updated.ownerId),
      updated.name,
      storeId,
      hadActiveAccount,
    );

    return {
      store: updated,
      verifiedAccountName: resolved.accountName,
    };
  }

  /** Rider counterpart of `resolveAccount` (docs/ROADMAP.md FDP-94) — self-service only. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Roles('rider')
  @Post('riders/me/payout/flutterwave/resolve-account')
  async resolveRiderAccount(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ResolveFlutterwaveAccountDto,
  ) {
    await this.ridersService.findMine(user.sub);

    return this.callFlutterwave('resolve account', () =>
      this.flutterwaveAdapter.resolveAccount(dto.accountNumber, dto.bankCode),
    );
  }

  /** Rider counterpart of `setup` (docs/ROADMAP.md FDP-94) — self-service only. `businessEmail`
   * is the rider's own account email, straight from the access token — no separate user lookup
   * needed the way the restaurant/store variants require, since a rider IS the authenticated
   * caller. `splitValue: 0` for the same reason `PaystackPayoutsController.setupRider`'s
   * `percentageCharge: 0` is — riders keep 100% of their delivery fees. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Roles('rider')
  @Post('riders/me/payout/flutterwave/setup')
  async setupRider(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ResolveFlutterwaveAccountDto,
  ) {
    const rider = await this.ridersService.findMine(user.sub);

    const hadActiveAccount = rider.payoutAccounts.some(
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
          businessName: resolved.accountName,
          businessEmail: user.email,
          bankCode: dto.bankCode,
          accountNumber: dto.accountNumber,
          splitValue: 0,
        }),
    );

    const updated = await this.ridersService.setPayoutAccount(
      user.sub,
      'flutterwave',
      'active',
      subaccountId,
      { bankCode: dto.bankCode, accountNumber: dto.accountNumber },
    );

    this.notifyPayoutAccountChanged(
      user.sub,
      resolved.accountName,
      rider._id.toString(),
      hadActiveAccount,
    );

    return {
      rider: updated,
      verifiedAccountName: resolved.accountName,
    };
  }

  /** Same fraud-detection reasoning as PaystackPayoutsController's notification. */
  private notifyPayoutAccountChanged(
    notifyUserId: string,
    name: string,
    vendorId: string,
    wasReplacement: boolean,
  ): void {
    const action = wasReplacement
      ? 'changed to a new bank account'
      : 'connected for the first time';
    const body = `The Flutterwave payout account for ${name} was just ${action}. Future orders will settle to this account. If you didn't make this change, contact support immediately.`;
    this.notificationsService
      .notify({
        userId: notifyUserId,
        type: 'payout_account_changed',
        title: 'Payout account updated',
        body,
        metadata: { vendorId, provider: 'flutterwave' },
        email: {
          subject: `Payout account updated — ${name}`,
          html: `<p>${body}</p>`,
        },
      })
      .catch((err: Error) =>
        this.logger.error(
          `Payout-change notification failed for ${vendorId}: ${err.message}`,
        ),
      );
  }
}
