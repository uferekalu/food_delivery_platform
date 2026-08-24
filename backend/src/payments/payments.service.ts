import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from '../orders/orders.service';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { PaymentProviderResolver } from './provider-resolver';
import type { PaymentProvider } from './payment-provider';
import { StripeAdapter } from './adapters/stripe.adapter';
import { PaystackAdapter } from './adapters/paystack.adapter';
import { FlutterwaveAdapter } from './adapters/flutterwave.adapter';
import type {
  PaymentAdapter,
  InitiatePaymentResult,
} from './adapters/payment-adapter.interface';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly ordersService: OrdersService,
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
    const event = await adapter.handleWebhook(rawBody, signature);
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

    if (event.success) {
      await this.ordersService.markPaidFromWebhook(order._id.toString());
    } else {
      await this.ordersService.markPaymentFailed(order._id.toString());
    }
  }
}
