import { Injectable } from '@nestjs/common';
import type { PaymentProvider } from './payment-provider';

/**
 * Currency → ordered provider list, index 0 is the auto-selected default (docs/ARCHITECTURE.md
 * §4 "Payment routing"). A config table, not hardcoded branching, so a new currency/provider is
 * a table edit here, not a change to checkout/webhook code. Built in FDP-11 (order creation
 * needs to resolve+store a provider) — the actual provider SDK adapters/webhooks are FDP-14;
 * until then this only ever decides *which* provider an order is tagged with, never charges
 * anything.
 */
const CURRENCY_PROVIDER_TABLE: Record<string, PaymentProvider[]> = {
  NGN: ['paystack', 'flutterwave', 'stripe'],
  GHS: ['flutterwave', 'paystack', 'stripe'],
  KES: ['flutterwave', 'paystack', 'stripe'],
  ZAR: ['flutterwave', 'paystack', 'stripe'],
  UGX: ['flutterwave', 'paystack', 'stripe'],
};

const GLOBAL_DEFAULT: PaymentProvider[] = ['stripe', 'flutterwave'];

@Injectable()
export class PaymentProviderResolver {
  /** Ordered list of providers that support `currency`; index 0 is the auto-selected default,
   * the rest populate a "switch provider" UI once one exists (FDP-14). */
  resolve(currency: string): PaymentProvider[] {
    return CURRENCY_PROVIDER_TABLE[currency.toUpperCase()] ?? GLOBAL_DEFAULT;
  }

  resolveDefault(currency: string): PaymentProvider {
    return this.resolve(currency)[0];
  }
}
