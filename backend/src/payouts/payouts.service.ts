import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import type { PaymentProvider } from '../payments/payment-provider';

export interface UnpaidEarningsGroup {
  provider: PaymentProvider;
  currency: string;
  grossAmount: number;
  orderIds: string[];
}

// Same fix as OrdersService's round2 (docs/ROADMAP.md FDP-65) — `+ Number.EPSILON` before
// rounding corrects IEEE-754 double-precision cases that a plain `Math.round(value * 100) / 100`
// silently rounds down a full cent.
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Payout ledger foundation (docs/ROADMAP.md FDP-91) — read-only aggregation for now. The actual
 * transfer execution and the scheduled weekly job that drives it are built in the follow-up
 * ticket that introduces `Payout` documents for real; this service exists first so that logic
 * has a single, independently-testable source of "what does this vendor/rider currently have
 * coming to them" to build on, rather than duplicating the aggregation inline in a cron handler.
 */
@Injectable()
export class PayoutsService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
  ) {}

  /**
   * Every `DELIVERED` order for this restaurant/store whose vendor cut hasn't been included in a
   * payout yet, grouped by (provider, currency) — not just currency. This matters for real
   * transfer execution (docs/ROADMAP.md FDP-92): the money currently sits in the platform's own
   * balance *with whichever provider actually processed the charge* (a customer can override the
   * default provider per order, `InitiatePaymentDto.provider`), so a transfer for a given group
   * has to go out through that same provider — Stripe can't move money that Paystack collected.
   * Almost always one group per vendor, but not guaranteed. Uses `Order.restaurantPayoutAmount`
   * — already net of the platform's commission, see `docs/ARCHITECTURE.md` §14.
   *
   * Excludes any order with `settledViaInstantSplit: true` — the provider already sent that
   * vendor their cut automatically at charge time (§14's still-live instant split, running in
   * parallel with this batch throughout the staged rollout), so including it here would pay the
   * same order out a second time. See `Order.settledViaInstantSplit`'s doc comment.
   */
  async getUnpaidVendorEarnings(
    vendorType: 'restaurant' | 'store',
    vendorId: string,
  ): Promise<UnpaidEarningsGroup[]> {
    const filter =
      vendorType === 'restaurant'
        ? { sellerType: 'restaurant' as const, restaurantId: vendorId }
        : { sellerType: 'store' as const, storeId: vendorId };

    const orders = await this.orderModel
      .find({
        ...filter,
        status: 'DELIVERED',
        vendorPayoutId: null,
        settledViaInstantSplit: { $ne: true },
      })
      .select('_id currency paymentProvider restaurantPayoutAmount')
      .exec();

    return this.groupByProviderAndCurrency(
      orders.map((o) => ({
        id: o._id.toString(),
        provider: o.paymentProvider,
        currency: o.currency,
        amount: o.restaurantPayoutAmount,
      })),
    );
  }

  /** Same idea as `getUnpaidVendorEarnings`, but for a rider's own delivery-fee earnings — riders
   * keep 100% of `deliveryFee` (no platform commission on the rider side, see
   * `docs/ARCHITECTURE.md` §14). */
  async getUnpaidRiderEarnings(
    riderUserId: string,
  ): Promise<UnpaidEarningsGroup[]> {
    const orders = await this.orderModel
      .find({ riderId: riderUserId, status: 'DELIVERED', riderPayoutId: null })
      .select('_id currency paymentProvider deliveryFee')
      .exec();

    return this.groupByProviderAndCurrency(
      orders.map((o) => ({
        id: o._id.toString(),
        provider: o.paymentProvider,
        currency: o.currency,
        amount: o.deliveryFee,
      })),
    );
  }

  private groupByProviderAndCurrency(
    rows: {
      id: string;
      provider: PaymentProvider;
      currency: string;
      amount: number;
    }[],
  ): UnpaidEarningsGroup[] {
    const groups = new Map<string, UnpaidEarningsGroup>();
    for (const row of rows) {
      const key = `${row.provider}:${row.currency}`;
      const group = groups.get(key) ?? {
        provider: row.provider,
        currency: row.currency,
        grossAmount: 0,
        orderIds: [],
      };
      group.grossAmount = round2(group.grossAmount + row.amount);
      group.orderIds.push(row.id);
      groups.set(key, group);
    }
    return Array.from(groups.values());
  }
}
