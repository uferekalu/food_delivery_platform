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
import { NotificationsService } from '../notifications/notifications.service';
import { PLATFORM_COMMISSION_RATE } from '../common/constants/platform-fee';
import { PaystackAdapter } from './adapters/paystack.adapter';
import { ResolvePaystackAccountDto } from './dto/resolve-paystack-account.dto';

/**
 * Vendor payouts epic, part 2 of 4 (docs/ROADMAP.md FDP-52) — Paystack-specific onboarding.
 * Lives in PaymentsModule (owns PaystackAdapter) rather than RestaurantsModule, but the routes
 * are namespaced under `/restaurants/:restaurantId/...` since that's what they're conceptually
 * about — a controller's routes aren't tied to which module it's declared in.
 *
 * Extended to stores and riders in docs/ROADMAP.md FDP-94 — `/stores/:storeId/...` mirrors the
 * restaurant routes exactly (stores have an `ownerId` the same way restaurants do); riders are
 * self-service only via `/riders/me/...` (no separate owner — see `RidersService`'s payout
 * methods doc comment), matching the simplification `PayoutsController`'s
 * `GET /payouts/riders/me` already made in FDP-93.
 */
@ApiTags('payments')
@Controller()
export class PaystackPayoutsController {
  private readonly logger = new Logger(PaystackPayoutsController.name);

  constructor(
    private readonly paystackAdapter: PaystackAdapter,
    private readonly restaurantsService: RestaurantsService,
    private readonly storesService: StoresService,
    private readonly ridersService: RidersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * A raw adapter error (Paystack rejecting an invalid account number, a bank code mismatch, a
   * transient API error) must never surface as an opaque 500 — same reasoning, and the same
   * fix, as PaymentsService.initiatePayment/refundOrder. Missing this here was a real bug: every
   * one of these three endpoints threw a plain Error straight through to Nest's global filter on
   * any real-world failure (e.g. an account number Paystack can't resolve), which is precisely
   * the common case for a first-time setup attempt with a typo.
   */
  private async callPaystack<T>(
    action: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.logger.error(`Paystack ${action} failed`, error);
      const message = error instanceof Error ? error.message : 'Paystack error';
      throw new BadRequestException(message);
    }
  }

  /** Not restaurant-scoped — the bank list is the same for everyone, just proxied through our
   * backend so the frontend never needs a Paystack key of its own. */
  @Get('payments/paystack/banks')
  listBanks() {
    return this.callPaystack('list banks', () =>
      this.paystackAdapter.listBanks(),
    );
  }

  // Tighter than the app-wide 100/min default (backend/CLAUDE.md) — every call here reaches out
  // to Paystack on the restaurant's behalf, and Paystack's own test-mode cap (3 real resolves/
  // day, see FDP-57) makes this an easy budget to blow through accidentally; a generous-but-real
  // ceiling still stops it from being hammered outright.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Roles('restaurant_owner', 'admin')
  @Post('restaurants/:restaurantId/payout/paystack/resolve-account')
  async resolveAccount(
    @CurrentUser() user: AccessTokenPayload,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: ResolvePaystackAccountDto,
  ) {
    // Ownership-checked even though nothing is persisted here — this still calls out to
    // Paystack on the restaurant's behalf, and there's no reason to let just anyone probe
    // arbitrary account numbers through our backend.
    const restaurant =
      await this.restaurantsService.findByIdOrThrow(restaurantId);
    this.restaurantsService.assertOwnerOrAdmin(restaurant, user);

    return this.callPaystack('resolve account', () =>
      this.paystackAdapter.resolveAccount(dto.accountNumber, dto.bankCode),
    );
  }

  /**
   * Re-resolves the account server-side rather than trusting whatever the client already showed
   * the user from a prior `resolve-account` call — cheap, and means a subaccount is never
   * created against a number Paystack itself would reject. `businessName` is this restaurant's
   * own name (not the bank account holder's name, which is what resolveAccount confirms) — a
   * subaccount's business_name is just a display label on Paystack's side.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Roles('restaurant_owner', 'admin')
  @Post('restaurants/:restaurantId/payout/paystack/setup')
  async setup(
    @CurrentUser() user: AccessTokenPayload,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: ResolvePaystackAccountDto,
  ) {
    const restaurant =
      await this.restaurantsService.findByIdOrThrow(restaurantId);
    this.restaurantsService.assertOwnerOrAdmin(restaurant, user);

    // Captured before the update — distinguishes "connecting for the first time" from
    // "replacing an already-active account", the latter being the higher-risk signal worth
    // calling out explicitly in the notification below (see its comment for why).
    const hadActiveAccount = restaurant.payoutAccounts.some(
      (account) =>
        account.provider === 'paystack' && account.status === 'active',
    );

    const resolved = await this.callPaystack('resolve account', () =>
      this.paystackAdapter.resolveAccount(dto.accountNumber, dto.bankCode),
    );
    const { subaccountCode } = await this.callPaystack(
      'create subaccount',
      () =>
        this.paystackAdapter.createSubaccount({
          businessName: restaurant.name,
          bankCode: dto.bankCode,
          accountNumber: dto.accountNumber,
          percentageCharge: PLATFORM_COMMISSION_RATE * 100,
        }),
    );

    const updated = await this.restaurantsService.setPayoutAccount(
      restaurantId,
      user,
      'paystack',
      'active',
      subaccountCode,
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
  @Post('stores/:storeId/payout/paystack/resolve-account')
  async resolveStoreAccount(
    @CurrentUser() user: AccessTokenPayload,
    @Param('storeId') storeId: string,
    @Body() dto: ResolvePaystackAccountDto,
  ) {
    const store = await this.storesService.findByIdOrThrow(storeId);
    this.storesService.assertOwnerOrAdmin(store, user);

    return this.callPaystack('resolve account', () =>
      this.paystackAdapter.resolveAccount(dto.accountNumber, dto.bankCode),
    );
  }

  /** Store counterpart of `setup` (docs/ROADMAP.md FDP-94) — identical reasoning. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Roles('restaurant_owner', 'admin')
  @Post('stores/:storeId/payout/paystack/setup')
  async setupStore(
    @CurrentUser() user: AccessTokenPayload,
    @Param('storeId') storeId: string,
    @Body() dto: ResolvePaystackAccountDto,
  ) {
    const store = await this.storesService.findByIdOrThrow(storeId);
    this.storesService.assertOwnerOrAdmin(store, user);

    const hadActiveAccount = store.payoutAccounts.some(
      (account) =>
        account.provider === 'paystack' && account.status === 'active',
    );

    const resolved = await this.callPaystack('resolve account', () =>
      this.paystackAdapter.resolveAccount(dto.accountNumber, dto.bankCode),
    );
    const { subaccountCode } = await this.callPaystack(
      'create subaccount',
      () =>
        this.paystackAdapter.createSubaccount({
          businessName: store.name,
          bankCode: dto.bankCode,
          accountNumber: dto.accountNumber,
          percentageCharge: PLATFORM_COMMISSION_RATE * 100,
        }),
    );

    const updated = await this.storesService.setPayoutAccount(
      storeId,
      user,
      'paystack',
      'active',
      subaccountCode,
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

  /** Rider counterpart of `resolveAccount` (docs/ROADMAP.md FDP-94) — self-service only, no id
   * param (see class doc comment). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Roles('rider')
  @Post('riders/me/payout/paystack/resolve-account')
  async resolveRiderAccount(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ResolvePaystackAccountDto,
  ) {
    // Confirms the caller actually has a rider profile before spending a Paystack call on their
    // behalf — same ownership-gating reasoning as the restaurant/store variants, just via
    // `findMine` instead of an explicit id param.
    await this.ridersService.findMine(user.sub);

    return this.callPaystack('resolve account', () =>
      this.paystackAdapter.resolveAccount(dto.accountNumber, dto.bankCode),
    );
  }

  /** Rider counterpart of `setup` (docs/ROADMAP.md FDP-94) — self-service only. Riders keep 100%
   * of their delivery fees (docs/ARCHITECTURE.md §14/§18), so unlike the restaurant/store
   * subaccount (which carries the platform's commission split as its stored default),
   * `percentageCharge` here is 0 — nothing about a rider's payout account should ever cause
   * Paystack to withhold a cut. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Roles('rider')
  @Post('riders/me/payout/paystack/setup')
  async setupRider(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ResolvePaystackAccountDto,
  ) {
    const rider = await this.ridersService.findMine(user.sub);

    const hadActiveAccount = rider.payoutAccounts.some(
      (account) =>
        account.provider === 'paystack' && account.status === 'active',
    );

    const resolved = await this.callPaystack('resolve account', () =>
      this.paystackAdapter.resolveAccount(dto.accountNumber, dto.bankCode),
    );
    const { subaccountCode } = await this.callPaystack(
      'create subaccount',
      () =>
        this.paystackAdapter.createSubaccount({
          businessName: resolved.accountName,
          bankCode: dto.bankCode,
          accountNumber: dto.accountNumber,
          percentageCharge: 0,
        }),
    );

    const updated = await this.ridersService.setPayoutAccount(
      user.sub,
      'paystack',
      'active',
      subaccountCode,
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

  /**
   * Fraud-detection measure, not a functional requirement — a vendor's/rider's payout
   * destination silently changing is exactly what an attacker with a compromised account would
   * do to redirect future earnings, so the owner always gets an email the moment it happens,
   * whether they triggered it themselves or not (best-effort: failure here never blocks the
   * setup that already succeeded, same as every other notify() call in this codebase).
   */
  private notifyPayoutAccountChanged(
    notifyUserId: string,
    name: string,
    vendorId: string,
    wasReplacement: boolean,
  ): void {
    const action = wasReplacement
      ? 'changed to a new bank account'
      : 'connected for the first time';
    const body = `The Paystack payout account for ${name} was just ${action}. Future orders will settle to this account. If you didn't make this change, contact support immediately.`;
    this.notificationsService
      .notify({
        userId: notifyUserId,
        type: 'payout_account_changed',
        title: 'Payout account updated',
        body,
        metadata: { vendorId, provider: 'paystack' },
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
