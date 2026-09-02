import {
  BadRequestException,
  Controller,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { UsersService } from '../users/users.service';
import { StripeAdapter } from './adapters/stripe.adapter';

/**
 * Vendor payouts epic, part 4 of 4 (docs/ROADMAP.md FDP-54) — Stripe Connect onboarding. Unlike
 * PaystackPayoutsController/FlutterwavePayoutsController (one endpoint that both creates the
 * account and finalizes it in a single API call), Stripe Connect is a hosted redirect flow:
 * this has exactly one endpoint, which creates the connected account (once) and always returns
 * a fresh onboarding link to send the restaurant to. Whether the account actually becomes usable
 * is decided later, by `PaymentsService.handleStripeAccountWebhook` — never by anything in this
 * controller.
 */
@ApiTags('payments')
@Controller()
export class StripePayoutsController {
  private readonly logger = new Logger(StripePayoutsController.name);

  constructor(
    private readonly stripeAdapter: StripeAdapter,
    private readonly restaurantsService: RestaurantsService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  /** Same reasoning as PaystackPayoutsController.callPaystack — a raw adapter error must never
   * surface as an opaque 500. */
  private async callStripe<T>(
    action: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.logger.error(`Stripe ${action} failed`, error);
      const message = error instanceof Error ? error.message : 'Stripe error';
      throw new BadRequestException(message);
    }
  }

  /**
   * Creates the restaurant's connected Express account the *first* time this is called
   * (reused on every later call, keyed off `payoutAccounts`' existing `stripe` entry's
   * reference), then always returns a fresh onboarding link — Account Links expire within
   * minutes (confirmed live against the sandbox), so re-requesting one is the normal path for
   * a restaurant that let the first link expire or abandoned onboarding partway, not an error.
   * `businessEmail` is the owning user's account email — there's no restaurant-level email
   * field, same gap Flutterwave's onboarding (FDP-53) hit.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Roles('restaurant_owner', 'admin')
  @Post('restaurants/:restaurantId/payout/stripe/setup')
  async setup(
    @CurrentUser() user: AccessTokenPayload,
    @Param('restaurantId') restaurantId: string,
  ) {
    const restaurant =
      await this.restaurantsService.findByIdOrThrow(restaurantId);
    this.restaurantsService.assertOwnerOrAdmin(restaurant, user);

    let accountId = restaurant.payoutAccounts.find(
      (account) => account.provider === 'stripe',
    )?.reference;

    if (!accountId) {
      const owner = await this.usersService.findById(
        restaurant.ownerId.toString(),
      );
      if (!owner) {
        throw new BadRequestException("Could not find this restaurant's owner");
      }
      const created = await this.callStripe('create connected account', () =>
        this.stripeAdapter.createConnectedAccount(owner.email),
      );
      accountId = created.accountId;
      // Always 'pending' at this point — only the account.updated webhook (once onboarding is
      // actually complete) ever flips this to 'active'.
      await this.restaurantsService.setPayoutAccount(
        restaurantId,
        user,
        'stripe',
        'pending',
        accountId,
      );
    }

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const earningsUrl = `${frontendUrl}/dashboard/restaurants/${restaurantId}/earnings`;
    const { url } = await this.callStripe('create onboarding link', () =>
      this.stripeAdapter.createOnboardingLink(
        accountId,
        earningsUrl,
        earningsUrl,
      ),
    );

    return { onboardingUrl: url };
  }
}
