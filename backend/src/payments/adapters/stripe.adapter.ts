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
}
