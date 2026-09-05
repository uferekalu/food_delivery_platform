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
import { StoresService } from '../stores/stores.service';
import { RidersService } from '../riders/riders.service';
import { UsersService } from '../users/users.service';
import { StripeAdapter } from './adapters/stripe.adapter';

/**
 * Vendor payouts epic, part 4 of 4 (docs/ROADMAP.md FDP-54) — Stripe Connect onboarding. Unlike
 * PaystackPayoutsController/FlutterwavePayoutsController (one endpoint that both creates the
 * account and finalizes it in a single API call), Stripe Connect is a hosted redirect flow:
 * this has exactly one endpoint per vendor type, which creates the connected account (once) and
 * always returns a fresh onboarding link to send the vendor to. Whether the account actually
 * becomes usable is decided later, by `PaymentsService.handleStripeAccountWebhook` — never by
 * anything in this controller.
 *
 * Extended to stores and riders in docs/ROADMAP.md FDP-94 — see
 * `PaystackPayoutsController`'s class doc comment for the shared reasoning.
 */
@ApiTags('payments')
@Controller()
export class StripePayoutsController {
  private readonly logger = new Logger(StripePayoutsController.name);

  constructor(
    private readonly stripeAdapter: StripeAdapter,
    private readonly restaurantsService: RestaurantsService,
    private readonly storesService: StoresService,
    private readonly ridersService: RidersService,
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

  /** Shared by every variant below — creates a connected Express account the *first* time
   * (reused on every later call), always returns a fresh onboarding link (Account Links expire
   * within minutes, confirmed live against the sandbox — re-requesting one is the normal path
   * for someone who let the first link expire or abandoned onboarding partway, not an error). */
  private async setupConnectedAccount(
    email: string,
    existingAccountId: string | null | undefined,
    persist: (accountId: string) => Promise<unknown>,
    returnUrl: string,
  ): Promise<{ onboardingUrl: string }> {
    let accountId = existingAccountId ?? undefined;
    if (!accountId) {
      const created = await this.callStripe('create connected account', () =>
        this.stripeAdapter.createConnectedAccount(email),
      );
      accountId = created.accountId;
      // Always 'pending' at this point — only the account.updated webhook (once onboarding is
      // actually complete) ever flips this to 'active'.
      await persist(accountId);
    }

    const { url } = await this.callStripe('create onboarding link', () =>
      this.stripeAdapter.createOnboardingLink(accountId, returnUrl, returnUrl),
    );
    return { onboardingUrl: url };
  }

  /**
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

    const owner = await this.usersService.findById(
      restaurant.ownerId.toString(),
    );
    if (!owner) {
      throw new BadRequestException("Could not find this restaurant's owner");
    }

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const earningsUrl = `${frontendUrl}/dashboard/restaurants/${restaurantId}/earnings`;
    return this.setupConnectedAccount(
      owner.email,
      restaurant.payoutAccounts.find((a) => a.provider === 'stripe')?.reference,
      (accountId) =>
        this.restaurantsService.setPayoutAccount(
          restaurantId,
          user,
          'stripe',
          'pending',
          accountId,
        ),
      earningsUrl,
    );
  }

  /** Store counterpart of `setup` (docs/ROADMAP.md FDP-94) — identical reasoning. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Roles('restaurant_owner', 'admin')
  @Post('stores/:storeId/payout/stripe/setup')
  async setupStore(
    @CurrentUser() user: AccessTokenPayload,
    @Param('storeId') storeId: string,
  ) {
    const store = await this.storesService.findByIdOrThrow(storeId);
    this.storesService.assertOwnerOrAdmin(store, user);

    const owner = await this.usersService.findById(store.ownerId.toString());
    if (!owner) {
      throw new BadRequestException("Could not find this store's owner");
    }

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const payoutsUrl = `${frontendUrl}/dashboard/stores/${storeId}/payouts`;
    return this.setupConnectedAccount(
      owner.email,
      store.payoutAccounts.find((a) => a.provider === 'stripe')?.reference,
      (accountId) =>
        this.storesService.setPayoutAccount(
          storeId,
          user,
          'stripe',
          'pending',
          accountId,
        ),
      payoutsUrl,
    );
  }

  /** Rider counterpart of `setup` (docs/ROADMAP.md FDP-94) — self-service only, `businessEmail`
   * straight from the access token (a rider IS the authenticated caller, no owner lookup
   * needed). */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Roles('rider')
  @Post('riders/me/payout/stripe/setup')
  async setupRider(@CurrentUser() user: AccessTokenPayload) {
    const rider = await this.ridersService.findMine(user.sub);

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const deliveriesUrl = `${frontendUrl}/rider/deliveries`;
    return this.setupConnectedAccount(
      user.email,
      rider.payoutAccounts.find((a) => a.provider === 'stripe')?.reference,
      (accountId) =>
        this.ridersService.setPayoutAccount(
          user.sub,
          'stripe',
          'pending',
          accountId,
        ),
      deliveriesUrl,
    );
  }
}
