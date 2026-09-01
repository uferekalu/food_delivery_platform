import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
  constructor(
    private readonly paystackAdapter: PaystackAdapter,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  /** Not restaurant-scoped — the bank list is the same for everyone, just proxied through our
   * backend so the frontend never needs a Paystack key of its own. */
  @Get('payments/paystack/banks')
  listBanks() {
    return this.paystackAdapter.listBanks();
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

    return this.paystackAdapter.resolveAccount(dto.accountNumber, dto.bankCode);
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

    const resolved = await this.paystackAdapter.resolveAccount(
      dto.accountNumber,
      dto.bankCode,
    );
    const { subaccountCode } = await this.paystackAdapter.createSubaccount({
      businessName: restaurant.name,
      bankCode: dto.bankCode,
      accountNumber: dto.accountNumber,
      percentageCharge: PLATFORM_COMMISSION_RATE * 100,
    });

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
