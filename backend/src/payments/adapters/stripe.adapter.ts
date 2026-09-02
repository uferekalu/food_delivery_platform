import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type {
  InitiatePaymentParams,
  InitiatePaymentResult,
  PaymentAdapter,
  VerifyPaymentResult,
  WebhookEvent,
} from './payment-adapter.interface';

// Stripe Checkout (a hosted redirect session) rather than embedded Elements/card fields — no
// PCI scope on this server, no Stripe.js frontend integration to maintain, and the redirect
// itself is never trusted for confirming payment (see handleWebhook) — only the signed webhook
// event is. Covers the global-currency side of docs/ARCHITECTURE.md §4's routing table
// (USD/EUR/GBP/...), all 2-decimal currencies, hence the flat `amount * 100` minor-unit
// conversion below.
@Injectable()
export class StripeAdapter implements PaymentAdapter {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(config: ConfigService) {
    this.stripe = new Stripe(config.getOrThrow<string>('STRIPE_SECRET_KEY'));
    this.webhookSecret = config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
  }

  async initiate(
    params: InitiatePaymentParams,
  ): Promise<InitiatePaymentResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: params.customerEmail,
      line_items: [
        {
          price_data: {
            currency: params.currency.toLowerCase(),
            unit_amount: Math.round(params.amount * 100),
            product_data: { name: `Order ${params.orderNumber}` },
          },
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { orderId: params.orderId },
      // Vendor payouts epic (docs/ROADMAP.md FDP-54) — a destination charge: `transfer_data
      // .destination` is the restaurant's connected Express account, and Stripe automatically
      // transfers `amount - application_fee_amount` to it once the charge settles. Same "what
      // the platform keeps" framing as Paystack's `transaction_charge` (docs/ROADMAP.md FDP-52)
      // — `application_fee_amount` is computed from `restaurantPayoutAmount`, never a flat
      // percentage of the whole total, for the same reason documented on
      // InitiatePaymentParams.restaurantPayoutAmount. Only ever set once the connected account
      // is fully onboarded (`payoutAccounts` entry status 'active', gated in
      // PaymentsService.initiatePayment) — Stripe rejects `transfer_data.destination` for an
      // account still missing the `transfers` capability, confirmed live against the sandbox.
      ...(params.restaurantPayoutAccountReference &&
      params.restaurantPayoutAmount != null
        ? {
            payment_intent_data: {
              application_fee_amount: Math.round(
                (params.amount - params.restaurantPayoutAmount) * 100,
              ),
              transfer_data: {
                destination: params.restaurantPayoutAccountReference,
              },
            },
          }
        : {}),
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }
    return { redirectUrl: session.url, reference: session.id };
  }

  async verify(reference: string): Promise<VerifyPaymentResult> {
    const session = await this.stripe.checkout.sessions.retrieve(reference);
    return { success: session.payment_status === 'paid', reference };
  }

  // Signature verification is pure local crypto (no network call) — no `await` needed, so this
  // stays a plain function returning an already-resolved Promise rather than `async` with
  // nothing to await.
  handleWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<WebhookEvent | null> {
    if (!signature) return Promise.resolve(null);

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch {
      return Promise.resolve(null);
    }

    if (event.type !== 'checkout.session.completed') {
      return Promise.resolve(null);
    }
    const session = event.data.object;
    return Promise.resolve({
      reference: session.id,
      success: session.payment_status === 'paid',
    });
  }

  async refund(paymentRef: string): Promise<void> {
    const session = await this.stripe.checkout.sessions.retrieve(paymentRef);
    const paymentIntent = session.payment_intent;
    if (!paymentIntent) return;
    await this.stripe.refunds.create({
      payment_intent:
        typeof paymentIntent === 'string' ? paymentIntent : paymentIntent.id,
    });
  }

  // --- Vendor payouts epic, part 4 of 4 (docs/ROADMAP.md FDP-54) ---
  // Stripe Connect (Express accounts) — structurally different from Paystack/Flutterwave's
  // single-API-call subaccount creation: onboarding is a multi-step hosted redirect flow the
  // restaurant completes on Stripe's own domain (bank details never touch this backend), and
  // completion is only known for certain via the `account.updated` webhook below — the browser
  // landing back on `return_url` does NOT guarantee the account holder actually finished.

  /** Express accounts request exactly the two capabilities this platform's split-payment flow
   * needs — `card_payments` (to be the merchant of record) and `transfers` (to receive the
   * destination-charge transfer). Both start "requested" but not yet active; Stripe grants them
   * once the account holder finishes hosted onboarding, confirmed live against the sandbox
   * (`charges_enabled`/`details_submitted` both `false` immediately after creation). */
  async createConnectedAccount(email: string): Promise<{ accountId: string }> {
    const account = await this.stripe.accounts.create({
      type: 'express',
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    return { accountId: account.id };
  }

  /** A fresh Account Link every call — these expire quickly (a handful of minutes, confirmed
   * live), so re-requesting one (e.g. the restaurant let the first link expire, or abandoned
   * onboarding partway) is the normal, expected path, not an error case. Reuses the existing
   * connected account id rather than creating a new Express account each time. */
  async createOnboardingLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<{ url: string }> {
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return { url: link.url };
  }

  /**
   * Verifies and parses an `account.updated` webhook event — the only reliable signal that a
   * connected account's onboarding status actually changed. Shares `webhookSecret`/signature
   * verification with `handleWebhook` above (both event types arrive on the same
   * `/payments/webhooks/stripe` endpoint, since a Stripe account has one webhook URL for every
   * subscribed event type) but is a separate method, not folded into `handleWebhook`, because it
   * answers a completely different question (a payout account's status, not a payment's
   * success) and isn't part of the shared `PaymentAdapter` interface — same reasoning as
   * Paystack/Flutterwave's payout-only methods. Returns `null` (never throws) for an invalid
   * signature or any other event type, exactly like `handleWebhook`.
   */
  parseAccountWebhookEvent(
    rawBody: Buffer,
    signature: string | undefined,
  ): {
    accountId: string;
    chargesEnabled: boolean;
    detailsSubmitted: boolean;
  } | null {
    if (!signature) return null;

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch {
      return null;
    }

    if (event.type !== 'account.updated') return null;
    const account = event.data.object;
    return {
      accountId: account.id,
      chargesEnabled: account.charges_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
    };
  }
}
