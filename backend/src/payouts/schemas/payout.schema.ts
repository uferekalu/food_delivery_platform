import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PAYMENT_PROVIDERS } from '../../payments/payment-provider';
import type { PaymentProvider } from '../../payments/payment-provider';

export const PAYOUT_VENDOR_TYPES = ['restaurant', 'store', 'rider'] as const;
export type PayoutVendorType = (typeof PAYOUT_VENDOR_TYPES)[number];

export const PAYOUT_STATUSES = [
  'pending',
  'processing',
  'succeeded',
  'failed',
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/**
 * Vendor payouts epic, replacing the instant charge-time provider split with a platform-
 * controlled weekly batch (docs/ROADMAP.md FDP-91 onward — see docs/ARCHITECTURE.md §14 for the
 * full design and why). One document per payout *attempt* for one vendor/rider — the durable
 * audit trail shown in both the admin and vendor/rider dashboards (FDP-93), and the thing a
 * scheduled job (FDP-92) actually creates and drives through `pending → processing →
 * succeeded|failed`.
 *
 * `orderIds` is the exact set of `DELIVERED` orders this specific attempt covers — atomically
 * claimed at creation time (see the scheduler ticket for the claim mechanism) so the same
 * order's earnings can never end up in two different payout attempts, and so a failed attempt's
 * orders can be identified and released back to the "unpaid, eligible for next run" pool without
 * ambiguity. `grossAmount` is the sum of whatever those orders actually owe this vendor/rider —
 * `Order.restaurantPayoutAmount` (already net of the platform's 15% commission — see
 * `docs/ARCHITECTURE.md` §14) for a restaurant/store, or the sum of `Order.deliveryFee` for a
 * rider (riders keep 100% of their delivery fees; the platform's cut only ever comes from the
 * vendor side).
 */
@Schema({ timestamps: true })
export class Payout {
  @Prop({
    type: String,
    enum: PAYOUT_VENDOR_TYPES,
    required: true,
    index: true,
  })
  vendorType: PayoutVendorType;

  // No `ref` — deliberately polymorphic (restaurant/store/rider all use the same collection),
  // and stores as a plain string like every other id field in this codebase's Mongoose 9 setup
  // (see backend/CLAUDE.md's ObjectId note) — always query/compare with a string, never a raw
  // ObjectId.
  @Prop({ type: String, required: true, index: true })
  vendorId: string;

  @Prop({ type: [Types.ObjectId], ref: 'Order', required: true })
  orderIds: Types.ObjectId[];

  @Prop({ type: Number, required: true, min: 0 })
  grossAmount: number;

  @Prop({ type: String, required: true, uppercase: true })
  currency: string;

  @Prop({ type: String, enum: PAYMENT_PROVIDERS, required: true })
  provider: PaymentProvider;

  /** The `PayoutAccount.reference` this attempt paid out to — snapshotted at creation time so a
   * later change to the vendor's payout account doesn't retroactively change what an already-
   * completed (or in-flight) payout record says it paid. */
  @Prop({ type: String, required: true })
  payoutAccountReference: string;

  @Prop({
    type: String,
    enum: PAYOUT_STATUSES,
    required: true,
    default: 'pending',
    index: true,
  })
  status: PayoutStatus;

  /** The provider's own transfer/payout id, once a transfer has actually been requested. */
  @Prop({ type: String, default: null })
  providerTransferReference: string | null;

  @Prop({ type: String, default: null })
  failureReason: string | null;

  @Prop({ type: Number, default: 0, min: 0 })
  retryCount: number;

  /**
   * Set true (docs/ROADMAP.md FDP-92) only when `transfer()` threw `TransferOutcomeUnknownError`
   * — the attempt failed in a way that leaves genuine doubt about whether the money actually
   * moved (a network-layer error, not a confirmed provider rejection). A `true` here means this
   * attempt's `orderIds` are deliberately still claimed (their `vendorPayoutId`/`riderPayoutId`
   * still points at this document) rather than released back to the unpaid pool, so the next
   * weekly run does NOT blindly retry and risk double-paying — an admin must check the provider's
   * own dashboard and resolve this one manually (FDP-93). A `false`/default here on a `failed`
   * status means the rejection was clean and confirmed (e.g. an inactive destination account) and
   * the orders were already released for automatic retry next run.
   */
  @Prop({ type: Boolean, default: false, index: true })
  reconciliationRequired: boolean;
}

export type PayoutDocument = HydratedDocument<Payout>;
export const PayoutSchema = SchemaFactory.createForClass(Payout);
