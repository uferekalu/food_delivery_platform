import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersService, REFUNDABLE_STATUSES } from '../orders/orders.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StoresService } from '../stores/stores.service';
import { RidersService } from '../riders/riders.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { OrderDocument } from '../orders/schemas/order.schema';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { PaymentProviderResolver } from './provider-resolver';
import type { PaymentProvider } from './payment-provider';
import { StripeAdapter } from './adapters/stripe.adapter';
import { PaystackAdapter } from './adapters/paystack.adapter';
import { FlutterwaveAdapter } from './adapters/flutterwave.adapter';
import { RefundOutcomeUnknownError } from './adapters/refund-outcome-unknown.error';
import type {
  PaymentAdapter,
  InitiatePaymentResult,
  VerifyPaymentResult,
} from './adapters/payment-adapter.interface';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly restaurantsService: RestaurantsService,
    private readonly storesService: StoresService,
    private readonly ridersService: RidersService,
    private readonly notificationsService: NotificationsService,
    private readonly providerResolver: PaymentProviderResolver,
    private readonly config: ConfigService,
    private readonly stripeAdapter: StripeAdapter,
    private readonly paystackAdapter: PaystackAdapter,
    private readonly flutterwaveAdapter: FlutterwaveAdapter,
  ) {}

  private getAdapter(provider: PaymentProvider): PaymentAdapter {
    switch (provider) {
      case 'stripe':
        return this.stripeAdapter;
      case 'paystack':
        return this.paystackAdapter;
      case 'flutterwave':
        return this.flutterwaveAdapter;
    }
  }

  async initiatePayment(
    user: AccessTokenPayload,
    orderId: string,
    providerOverride?: PaymentProvider,
  ): Promise<{ redirectUrl: string }> {
    const order = await this.ordersService.findOne(user.sub, orderId);
    if (order.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException(
        'This order has already been paid, or is no longer awaiting payment',
      );
    }

    let provider = order.paymentProvider;
    if (providerOverride) {
      const supported = this.providerResolver.resolve(order.currency);
      if (!supported.includes(providerOverride)) {
        throw new BadRequestException(
          `${providerOverride} does not support ${order.currency}`,
        );
      }
      provider = providerOverride;
    }

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const adapter = this.getAdapter(provider);

    let result: InitiatePaymentResult;
    try {
      result = await adapter.initiate({
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        amount: order.total,
        currency: order.currency,
        customerEmail: user.email,
        successUrl: `${frontendUrl}/checkout/callback?orderId=${order._id.toString()}`,
        cancelUrl: `${frontendUrl}/checkout/callback?orderId=${order._id.toString()}&cancelled=true`,
      });
    } catch (error) {
      // A raw adapter error (a provider's own API error — e.g. Stripe rejecting a charge below
      // its ~$0.50 minimum) would otherwise surface as an opaque 500 via the global exception
      // filter. The provider's own message is safe to relay (it's about the transaction, not
      // our internals) and is far more actionable than "Internal server error" — found via live
      // testing against the real Stripe API on a small NGN order (FDP-14).
      this.logger.error(
        `${provider} initiate failed for order ${order._id.toString()}`,
        error,
      );
      const message =
        error instanceof Error ? error.message : 'Payment provider error';
      throw new BadRequestException(
        `Couldn't start payment with ${provider}: ${message}`,
      );
    }

    // `settledViaInstantSplit` defaults to `false` (docs/ROADMAP.md FDP-95 cut over the
    // charge-time provider split entirely — see docs/ARCHITECTURE.md §14) — every new order's
    // full amount now settles to the platform's own account, and the vendor's cut is paid out
    // separately by the weekly batch (§19). The flag itself stays on the schema and
    // `PayoutsService` still excludes any order where it's `true`, since historical orders from
    // before this cutover genuinely were already paid via the old mechanism and must never be
    // paid a second time.
    await this.ordersService.setPaymentRef(order, provider, result.reference);
    return { redirectUrl: result.redirectUrl };
  }

  /**
   * Called by `PaymentsController`'s three webhook routes after the raw request body has been
   * captured (see main.ts's `rawBody: true`) — signature verification happens inside the
   * adapter, never here, so this method never sees an unverified event.
   */
  async handleWebhook(
    providerName: PaymentProvider,
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<void> {
    const adapter = this.getAdapter(providerName);
    let event: Awaited<ReturnType<PaymentAdapter['handleWebhook']>>;
    try {
      event = await adapter.handleWebhook(rawBody, signature);
    } catch (error) {
      // Defense in depth alongside each adapter's own parsing safety (docs/ROADMAP.md FDP-65) —
      // a webhook body that doesn't match the shape an adapter expects must never surface as an
      // uncaught 500 through this @Public() route: repeated 500s risk a provider auto-disabling
      // the endpoint, breaking payment confirmation for every future order on that provider.
      this.logger.error(`${providerName} webhook handling threw`, error);
      return;
    }
    if (!event) {
      this.logger.warn(`Rejected an unverifiable ${providerName} webhook`);
      return;
    }

    const order = await this.ordersService.findByPaymentRef(event.reference);
    if (!order) {
      this.logger.warn(
        `${providerName} webhook referenced an unknown payment ref: ${event.reference}`,
      );
      return;
    }
    // An order only ever has one live paymentProvider (order.paymentProvider — the provider its
    // *current* checkout attempt is using) — a webhook arriving on a *different* provider's
    // route for that same reference can only mean the reference collided or was spoofed, since a
    // real provider only ever fires its own events for its own references (docs/ROADMAP.md
    // FDP-65: this was previously unchecked, so a correctly-signed webhook on the wrong
    // provider's route could mark a Stripe/Paystack order paid with no charge ever collected
    // anywhere).
    if (order.paymentProvider !== providerName) {
      this.logger.warn(
        `${providerName} webhook referenced order ${order._id.toString()}, which belongs to ${order.paymentProvider} — ignoring`,
      );
      return;
    }

    if (event.success) {
      await this.ordersService.markPaidFromWebhook(order._id.toString());
    } else {
      await this.ordersService.markPaymentFailed(order._id.toString());
    }
  }

  /**
   * Client-triggered confirmation, called right after the provider redirects back to
   * `/checkout/callback` — the webhook is still the primary path (docs/ARCHITECTURE.md §4), but
   * relying on it alone left orders stuck in `PENDING_PAYMENT` forever whenever webhook delivery
   * didn't reach this deploy (e.g. the provider dashboard's webhook URL not pointed at the
   * current backend). `PaymentAdapter.verify()` asks the provider directly with our secret key —
   * this is the "authenticated verify() call" alternative CLAUDE.md's payment-state rule already
   * names alongside webhook verification, it just had no caller until now. Reuses the same
   * idempotent order-transition methods the webhook path uses, so whichever of the two arrives
   * first wins and the other is a safe no-op.
   */
  async verifyPayment(userId: string, orderId: string): Promise<OrderDocument> {
    const order = await this.ordersService.findOne(userId, orderId);
    if (order.status !== 'PENDING_PAYMENT') return order;
    if (!order.paymentRef) {
      throw new BadRequestException(
        'This order has no payment attempt to verify yet',
      );
    }

    const adapter = this.getAdapter(order.paymentProvider);
    let result: VerifyPaymentResult;
    try {
      result = await adapter.verify(order.paymentRef);
    } catch (error) {
      // A provider-side error *checking* status is not the same as a failed payment — leave the
      // order in PENDING_PAYMENT so the webhook, or a later retry, can still resolve it.
      this.logger.error(
        `${order.paymentProvider} verify failed for order ${orderId}`,
        error,
      );
      return order;
    }

    if (result.success) {
      return (await this.ordersService.markPaidFromWebhook(orderId)) ?? order;
    }
    return (await this.ordersService.markPaymentFailed(orderId)) ?? order;
  }

  /**
   * Admin-triggered refund (docs/ROADMAP.md FDP-20's "dispute/refund handling", extended by
   * FDP-65). Reachable for a `DELIVERED` order (the normal post-delivery dispute case) or a
   * `CANCELLED` one (an order cancelled *after* payment already succeeded but before delivery —
   * previously had no refund path at all, since `CANCELLED` was terminal) with a `succeeded`
   * payment; anything else means there's no charge to reverse, or it was never collected.
   *
   * Two-phase to survive concurrent calls (docs/ROADMAP.md FDP-65) — `claimForRefund` atomically
   * flips the order to `REFUNDED` *before* the provider is asked to reverse anything, so a
   * second near-simultaneous call (admin double-click, client retry) sees the order already
   * claimed and stops here rather than firing a second live refund at the provider. If the
   * provider call then fails, `revertFailedRefundClaim` puts the order back exactly where it
   * was — the claim is never left standing over a refund that didn't actually happen.
   */
  async refundOrder(orderId: string): Promise<OrderDocument> {
    const order = await this.ordersService.adminFindOrThrow(orderId);
    if (
      !REFUNDABLE_STATUSES.includes(order.status) ||
      order.paymentStatus !== 'succeeded'
    ) {
      throw new BadRequestException(
        'Only a delivered or cancelled order with a successful payment can be refunded',
      );
    }
    if (order.refundReconciliationRequired) {
      // docs/ROADMAP.md FDP-104 — a previous attempt's outcome is genuinely unknown; blindly
      // retrying risks a second real refund at the provider. An admin must resolve it first via
      // resolveRefundReconciliation.
      throw new BadRequestException(
        'This order has a refund attempt pending manual reconciliation — resolve that first',
      );
    }
    if (!order.paymentRef) {
      throw new BadRequestException(
        'This order has no payment reference to refund',
      );
    }

    const claimed = await this.ordersService.claimForRefund(orderId);
    if (!claimed) {
      throw new BadRequestException(
        'This order cannot be refunded — it may already be refunded, or was just changed by someone else',
      );
    }

    const adapter = this.getAdapter(order.paymentProvider);
    try {
      await adapter.refund(order.paymentRef);
    } catch (error) {
      if (error instanceof RefundOutcomeUnknownError) {
        // docs/ROADMAP.md FDP-104 — the reversal may already have happened at the provider;
        // reverting the claim here (as a confirmed rejection would) risks a false "still
        // refundable" state that ends up double-refunded on a naive retry. Flag for manual
        // reconciliation instead — mirrors TransferOutcomeUnknownError's handling on the payout
        // side.
        await this.ordersService.flagAmbiguousRefund(
          orderId,
          claimed.status,
          error.message,
        );
        this.logger.error(
          `${order.paymentProvider} refund outcome UNKNOWN for order ${orderId} — flagged for manual reconciliation`,
          error,
        );
        throw new BadRequestException(
          `Couldn't confirm the refund via ${order.paymentProvider} — it has been flagged for manual reconciliation rather than retried automatically`,
        );
      }
      await this.ordersService.revertFailedRefundClaim(orderId, claimed.status);
      this.logger.error(
        `${order.paymentProvider} refund failed for order ${orderId}`,
        error,
      );
      const message =
        error instanceof Error ? error.message : 'Payment provider error';
      throw new BadRequestException(
        `Couldn't refund via ${order.paymentProvider}: ${message}`,
      );
    }

    return this.ordersService.finalizeRefund(orderId);
  }

  /** Admin's manual close-out for an order flagged `refundReconciliationRequired` (docs/ROADMAP.md
   * FDP-104) — thin passthrough, `OrdersService.resolveRefundReconciliation` owns the actual
   * state transitions (including re-running the refund-clawback check on success). */
  resolveRefundReconciliation(
    orderId: string,
    refundActuallySucceeded: boolean,
  ): Promise<OrderDocument> {
    return this.ordersService.resolveRefundReconciliation(
      orderId,
      refundActuallySucceeded,
    );
  }

  /**
   * Detects a refund or dispute issued OUTSIDE this app (docs/ROADMAP.md FDP-104) — a support
   * agent refunding directly in a provider's dashboard, or a customer's bank filing a chargeback.
   * Called unconditionally alongside `handleWebhook`/`handleStripeAccountWebhook`, same "one URL,
   * multiple event types, each parse safely no-ops on the others" pattern already used for the
   * Stripe Connect account webhook.
   */
  async handleRefundWebhook(
    providerName: PaymentProvider,
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<void> {
    let result: {
      reference: string;
      kind: 'refunded' | 'dispute_created';
      amountRefunded?: number;
    } | null;
    try {
      if (providerName === 'stripe') {
        const parsed =
          await this.stripeAdapter.parseRefundOrDisputeWebhookEvent(
            rawBody,
            signature,
          );
        result = parsed
          ? {
              reference: parsed.sessionReference,
              kind: parsed.kind,
              amountRefunded: parsed.amountRefunded,
            }
          : null;
      } else if (providerName === 'paystack') {
        result = await this.paystackAdapter.parseRefundOrDisputeWebhookEvent(
          rawBody,
          signature,
        );
      } else {
        const parsed = await this.flutterwaveAdapter.parseRefundWebhookEvent(
          rawBody,
          signature,
        );
        result = parsed
          ? {
              reference: parsed.sessionReference,
              kind: 'refunded',
              amountRefunded: parsed.amountRefunded,
            }
          : null;
      }
    } catch (error) {
      // Same defense-in-depth as handleWebhook — this is a @Public() route, a malformed or
      // unexpected payload here must never surface as an uncaught 500.
      this.logger.error(
        `${providerName} refund/dispute webhook handling threw`,
        error,
      );
      return;
    }
    if (!result) return;

    const order = await this.ordersService.findByPaymentRef(result.reference);
    if (!order || order.paymentProvider !== providerName) return;

    if (result.kind === 'dispute_created') {
      if (order.disputeFlagged) return;
      await this.ordersService.flagDispute(order._id.toString());
      return;
    }

    // An out-of-band refund. Safe no-op if we already know about it (our own admin-triggered
    // refund, or a duplicate webhook delivery — all providers explicitly guarantee at-least-once
    // delivery) — reuses the exact atomic claim/finalize pair the manual admin flow already uses,
    // so idempotency and concurrency safety come for free.
    if (order.status === 'REFUNDED') return;

    // A PARTIAL refund (docs/ROADMAP.md FDP-109) — `charge.refunded`/`refund.processed`/
    // `refund.completed` all fire for ANY refund amount, not just a full one, but this app's
    // refund model is all-or-nothing (see OrdersService.notifyAdminsOfPartialRefund's doc
    // comment). Only branches when the parsed amount is both present AND meaningfully less than
    // the order's total (a small tolerance absorbs float/rounding noise) — if a provider's
    // amount field is ever missing or mis-parsed, this falls through to the existing full-refund
    // handling below exactly as it did before this check existed, never a regression.
    if (
      result.amountRefunded !== undefined &&
      result.amountRefunded < order.total - 0.01
    ) {
      await this.ordersService.notifyAdminsOfPartialRefund(
        order,
        result.amountRefunded,
      );
      this.logger.warn(
        `Order ${order._id.toString()} received a PARTIAL refund (${order.currency} ${result.amountRefunded.toFixed(2)} of ${order.total.toFixed(2)}) outside the app via ${providerName} — flagged for admins, no automatic status change.`,
      );
      return;
    }

    const claimed = await this.ordersService.claimForRefund(
      order._id.toString(),
    );
    if (!claimed) return;
    await this.ordersService.finalizeRefund(order._id.toString());
    this.logger.warn(
      `Order ${order._id.toString()} was refunded outside the app via ${providerName} — order marked REFUNDED from webhook.`,
    );
  }

  /**
   * Stripe Connect's onboarding-completion signal (docs/ROADMAP.md FDP-54) — unlike Paystack/
   * Flutterwave's single-API-call subaccount creation, a restaurant's Express account only
   * becomes able to actually receive a transfer once they finish Stripe's own hosted onboarding
   * flow, and this webhook is the only reliable way to learn that happened (the browser landing
   * back on `return_url` does not guarantee the account holder actually completed it). Called
   * from the same `/payments/webhooks/stripe` route as `handleWebhook` above — a Stripe account
   * has one webhook URL for every subscribed event type, and each method's own adapter-level
   * parse safely no-ops on the other's event type.
   */
  async handleStripeAccountWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<void> {
    const event = this.stripeAdapter.parseAccountWebhookEvent(
      rawBody,
      signature,
    );
    if (!event) return;

    // A Stripe connected account belongs to exactly one of these three collections (docs/
    // ROADMAP.md FDP-94 extended this beyond restaurants) — checked in turn since the webhook
    // identifies the account only by its Stripe id, not which vendor type owns it. This is a
    // rare event, not a hot path, so up to three sequential lookups cost nothing that matters.
    const restaurant =
      await this.restaurantsService.findByPayoutAccountReference(
        'stripe',
        event.accountId,
      );
    const store = restaurant
      ? null
      : await this.storesService.findByPayoutAccountReference(
          'stripe',
          event.accountId,
        );
    const rider =
      restaurant || store
        ? null
        : await this.ridersService.findByPayoutAccountReference(
            'stripe',
            event.accountId,
          );

    const record = restaurant ?? store ?? rider;
    if (!record) {
      this.logger.warn(
        `Stripe account.updated webhook referenced an unknown account: ${event.accountId}`,
      );
      return;
    }

    const isActive = event.chargesEnabled && event.detailsSubmitted;
    const wasActive = record.payoutAccounts.some(
      (account) => account.provider === 'stripe' && account.status === 'active',
    );
    if (isActive === wasActive) return; // no real change — Stripe re-sends this on any account edit

    const newStatus = isActive ? 'active' : 'pending';
    let notifyUserId: string;
    let name: string;
    if (restaurant) {
      await this.restaurantsService.setPayoutAccountFromWebhook(
        restaurant._id.toString(),
        'stripe',
        newStatus,
        event.accountId,
      );
      notifyUserId = String(restaurant.ownerId);
      name = restaurant.name;
    } else if (store) {
      await this.storesService.setPayoutAccountFromWebhook(
        store._id.toString(),
        'stripe',
        newStatus,
        event.accountId,
      );
      notifyUserId = String(store.ownerId);
      name = store.name;
    } else {
      const r = rider!;
      await this.ridersService.setPayoutAccountFromWebhook(
        r._id.toString(),
        'stripe',
        newStatus,
        event.accountId,
      );
      notifyUserId = r.userId.toString();
      name = `rider account ${r._id.toString()}`;
    }

    // Only the pending->active transition is the security-relevant "new payout destination just
    // went live" moment (docs/ROADMAP.md FDP-59) — a still-pending account can't receive money,
    // so there's nothing to alert on yet, and this pass doesn't attempt a symmetric "payouts
    // paused" notification for the reverse (active->pending) transition.
    if (isActive) {
      this.notifyStripeAccountActivated(notifyUserId, name, record._id);
    }
  }

  private notifyStripeAccountActivated(
    notifyUserId: string,
    name: string,
    vendorId: unknown,
  ): void {
    const body = `The Stripe payout account for ${name} is now fully connected and can receive payouts. If you didn't set this up, contact support immediately.`;
    this.notificationsService
      .notify({
        userId: notifyUserId,
        type: 'payout_account_changed',
        title: 'Payout account updated',
        body,
        metadata: {
          vendorId: String(vendorId),
          provider: 'stripe',
        },
        email: {
          subject: `Payout account updated — ${name}`,
          html: `<p>${body}</p>`,
        },
      })
      .catch((err: Error) =>
        this.logger.error(
          `Payout-change notification failed for ${String(vendorId)}: ${err.message}`,
        ),
      );
  }
}
