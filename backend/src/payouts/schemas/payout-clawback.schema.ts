import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { PAYMENT_PROVIDERS } from '../../payments/payment-provider';
import type { PaymentProvider } from '../../payments/payment-provider';

export const PAYOUT_CLAWBACK_VENDOR_TYPES = ['restaurant', 'store'] as const;
export type PayoutClawbackVendorType =
  (typeof PAYOUT_CLAWBACK_VENDOR_TYPES)[number];

export const PAYOUT_CLAWBACK_STATUSES = ['pending', 'fully_applied'] as const;
export type PayoutClawbackStatus = (typeof PAYOUT_CLAWBACK_STATUSES)[number];

/**
 * Refund-vs-payout reconciliation (docs/ROADMAP.md FDP-104, docs/ARCHITECTURE.md §28) — a
 * refunded order whose vendor cut was *already* sent out by a previous weekly `Payout` has no
 * automatic way to give that money back (the platform has no standing instruction to pull funds
 * back out of a vendor's bank account). Instead, one of these is created for the exact amount the
 * vendor was overpaid, and the next weekly batch(es) silently deduct it from what that vendor
 * would otherwise be owed — see `PayoutsService.getUnpaidVendorEarnings` (netting) and
 * `PayoutExecutionService.executePayout` (consumption on confirmed success only).
 *
 * Deliberately `restaurant`/`store` only, never `rider` — a rider keeps 100% of `deliveryFee`
 * regardless of a later food-quality/order-issue refund, since they already performed the
 * delivery; there is nothing to claw back on the rider side.
 */
@Schema({ timestamps: true })
export class PayoutClawback {
  @Prop({
    type: String,
    enum: PAYOUT_CLAWBACK_VENDOR_TYPES,
    required: true,
    index: true,
  })
  vendorType: PayoutClawbackVendorType;

  // Plain string, like every other id field in this codebase's Mongoose 9 setup (see
  // backend/CLAUDE.md's ObjectId note) — never query with a raw ObjectId.
  @Prop({ type: String, required: true, index: true })
  vendorId: string;

  @Prop({ type: String, required: true, index: true })
  orderId: string;

  /** The `Payout` document that already paid the vendor for `orderId` — kept for audit purposes
   * only, never queried back against. */
  @Prop({ type: String, required: true })
  originalPayoutId: string;

  // Must match the (provider, currency) of the vendor's future earnings this will be netted
  // against — a clawback can only ever be consumed by a payout moving through the same provider
  // and currency the original overpayment did.
  @Prop({ type: String, enum: PAYMENT_PROVIDERS, required: true })
  provider: PaymentProvider;

  @Prop({ type: String, required: true, uppercase: true })
  currency: string;

  /** `order.restaurantPayoutAmount` at the moment this was created — the exact amount the vendor
   * was overpaid, never recomputed later. */
  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  /** Starts equal to `amount`; decremented only when a *confirmed successful* future payout
   * actually consumes some or all of it (never on a rejected/ambiguous attempt, and never
   * speculatively). If one week's earnings can't fully cover it, the remainder simply carries
   * forward — this field is always read live, not snapshotted per-run. */
  @Prop({ type: Number, required: true, min: 0 })
  remainingAmount: number;

  @Prop({
    type: String,
    enum: PAYOUT_CLAWBACK_STATUSES,
    required: true,
    default: 'pending',
    index: true,
  })
  status: PayoutClawbackStatus;
}

export type PayoutClawbackDocument = HydratedDocument<PayoutClawback>;
export const PayoutClawbackSchema =
  SchemaFactory.createForClass(PayoutClawback);
