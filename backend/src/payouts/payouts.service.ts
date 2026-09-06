import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import {
  PayoutClawback,
  PayoutClawbackDocument,
} from './schemas/payout-clawback.schema';
import type { PayoutClawbackVendorType } from './schemas/payout-clawback.schema';
import type { PaymentProvider } from '../payments/payment-provider';

export interface UnpaidEarningsGroup {
  provider: PaymentProvider;
  currency: string;
  /** Net amount to actually pay this run — already reduced by any pending clawback. This is what
   * PayoutExecutionService transfers and records as Payout.grossAmount; no other change needed
   * there for the "how much to send" question. */
  grossAmount: number;
  orderIds: string[];
  /** Undefined for a rider group (no clawback concept — riders keep 100% of deliveryFee
   * regardless, docs/ARCHITECTURE.md §28) and for a vendor group with no pending clawback. */
  rawGrossAmount?: number;
  clawbackDeducted?: number;
  clawbackConsumption?: { clawbackId: string; amountConsumed: number }[];
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
    @InjectModel(PayoutClawback.name)
    private readonly payoutClawbackModel: Model<PayoutClawbackDocument>,
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

    const rawGroups = this.groupByProviderAndCurrency(
      orders.map((o) => ({
        id: o._id.toString(),
        provider: o.paymentProvider,
        currency: o.currency,
        amount: o.restaurantPayoutAmount,
      })),
    );

    return this.applyClawbacks(vendorType, vendorId, rawGroups);
  }

  /**
   * Nets each raw earnings group against this vendor's pending clawbacks for the same
   * (provider, currency) — docs/ROADMAP.md FDP-104, docs/ARCHITECTURE.md §28. Oldest-first,
   * greedy consumption, capped so the net amount can never go negative; any unconsumed remainder
   * simply isn't included this run (it stays `pending` at its current `remainingAmount` and is
   * recomputed fresh — never snapshotted — next time this runs). `clawbackConsumption` records
   * exactly how much of each clawback THIS group's net amount would settle, so
   * `PayoutExecutionService` can decrement them only once the payout actually, confirmedly
   * succeeds — never here, since nothing has been paid yet at aggregation time.
   */
  private async applyClawbacks(
    vendorType: PayoutClawbackVendorType,
    vendorId: string,
    rawGroups: UnpaidEarningsGroup[],
  ): Promise<UnpaidEarningsGroup[]> {
    if (rawGroups.length === 0) return rawGroups;

    const pendingClawbacks = await this.payoutClawbackModel
      .find({ vendorType, vendorId, status: 'pending' })
      .sort({ createdAt: 1 })
      .exec();
    if (pendingClawbacks.length === 0) return rawGroups;

    return rawGroups.map((group) => {
      const matching = pendingClawbacks.filter(
        (c) => c.provider === group.provider && c.currency === group.currency,
      );
      if (matching.length === 0) return group;

      let remaining = group.grossAmount;
      const consumption: { clawbackId: string; amountConsumed: number }[] = [];
      for (const clawback of matching) {
        if (remaining <= 0) break;
        const consumed = round2(Math.min(remaining, clawback.remainingAmount));
        if (consumed <= 0) continue;
        consumption.push({
          clawbackId: clawback._id.toString(),
          amountConsumed: consumed,
        });
        remaining = round2(remaining - consumed);
      }
      const clawbackDeducted = round2(group.grossAmount - remaining);
      return {
        ...group,
        rawGrossAmount: group.grossAmount,
        grossAmount: remaining,
        clawbackDeducted,
        clawbackConsumption: consumption,
      };
    });
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
