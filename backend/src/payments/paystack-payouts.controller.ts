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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { PLATFORM_COMMISSION_RATE } from '../common/constants/platform-fee';
import { PaystackAdapter } from './adapters/paystack.adapter';
import { ResolvePaystackAccountDto } from './dto/resolve-paystack-account.dto';

/**
 * Vendor payouts epic, part 2 of 4 (docs/ROADMAP.md FDP-52) — Paystack-specific onboarding.
 * Lives in PaymentsModule (owns PaystackAdapter) rather than RestaurantsModule, but the routes
 * are namespaced under `/restaurants/:restaurantId/...` since that's what they're conceptually
 * about — a controller's routes aren't tied to which module it's declared in.
 */
@ApiTags('payments')
@Controller()
export class PaystackPayoutsController {
  private readonly logger = new Logger(PaystackPayoutsController.name);

  constructor(
    private readonly paystackAdapter: PaystackAdapter,
    private readonly restaurantsService: RestaurantsService,
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
    );

    return {
      restaurant: updated,
      verifiedAccountName: resolved.accountName,
    };
  }
}
