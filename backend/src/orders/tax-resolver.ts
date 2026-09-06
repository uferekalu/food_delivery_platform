import { Injectable } from '@nestjs/common';
import { round2 } from './orders.service';

/**
 * Currency → standard national VAT/sales-tax rate (docs/ROADMAP.md FDP-101) — the same
 * config-table convention `PaymentProviderResolver` already established (docs/ARCHITECTURE.md
 * §4): a new currency/rate is a table edit here, not a change to order-creation code.
 *
 * Rates below are each currency's one real-world country's standard national VAT rate as of
 * this ticket (Nigeria 7.5%, Ghana 15%, Kenya 16%, South Africa 15%, Uganda 18%, UK 20%) — a
 * starting point, not a live regulatory feed. **Verify against current law for the operating
 * jurisdiction before relying on this in production**; tax rates change, and nothing here
 * refreshes automatically.
 *
 * `USD`/`EUR` are deliberately absent, not merely unlisted by oversight: neither identifies a
 * single jurisdiction with one accurate flat rate (US sales tax is state/county-variable with no
 * national rate; Eurozone national VAT rates range roughly 17–27%), so stating a number for
 * either here would be actively wrong rather than approximately right — the same "don't fake
 * accuracy" reasoning `Order.tax`'s own doc comment already gave for leaving tax at a flat 0
 * before this ticket. They fall through to `DEFAULT_TAX_RATE` (0) below, same as any other
 * currency this table doesn't yet cover.
 */
const TAX_RATE_TABLE: Record<string, number> = {
  NGN: 0.075,
  GHS: 0.15,
  KES: 0.16,
  ZAR: 0.15,
  UGX: 0.18,
  GBP: 0.2,
};

const DEFAULT_TAX_RATE = 0;

@Injectable()
export class TaxResolver {
  getRate(currency: string): number {
    return TAX_RATE_TABLE[currency.toUpperCase()] ?? DEFAULT_TAX_RATE;
  }

  /**
   * `taxableAmount` is expected to already be net of any discount — standard VAT practice taxes
   * the amount actually charged, not the pre-discount list price (see the two call sites in
   * `orders.service.ts`, where this is computed after promo-code validation, on
   * `subtotal + deliveryFee + serviceFee - discount`). Clamped at 0 so a discount larger than the
   * pre-tax total (already possible today — `total` itself is clamped the same way) can't produce
   * negative tax.
   */
  calculate(taxableAmount: number, currency: string): number {
    return round2(Math.max(0, taxableAmount) * this.getRate(currency));
  }
}
