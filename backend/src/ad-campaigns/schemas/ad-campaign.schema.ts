import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { PaymentProvider } from '../../payments/payment-provider';

// A campaign is never platform-wide (unlike PromoCode) — it always advertises exactly one
// vendor. `pending_payment` is the only non-terminal state with no scheduled sweep watching it;
// it sits there until the vendor pays (or an admin manually marks it paid) or an admin cancels
// it. `ended`/`cancelled` are terminal — see ad-campaign-state-machine.ts for the full graph.
export const AD_CAMPAIGN_STATUSES = [
  'pending_payment',
  'scheduled',
  'active',
  'ended',
  'cancelled',
] as const;
export type AdCampaignStatus = (typeof AD_CAMPAIGN_STATUSES)[number];

// Split from `status` the same way Order splits `status`/`paymentStatus` (see
// OrdersService.markPaymentFailed's doc comment) — a failed charge attempt must not knock the
// campaign out of `pending_payment`, it should just let the vendor retry checkout.
export const AD_CAMPAIGN_PAYMENT_STATUSES = [
  'pending',
  'succeeded',
  'failed',
] as const;
export type AdCampaignPaymentStatus =
  (typeof AD_CAMPAIGN_PAYMENT_STATUSES)[number];

@Schema({ timestamps: true })
export class AdCampaign {
  // Exactly one of these two is ever set — never both, never neither (mirrors PromoCode's
  // restaurantId/storeId XOR convention, but unlike PromoCode there is no platform-wide null/null
  // case here; enforced in AdCampaignsService.create, not the schema itself).
  // No `index: true` here — the partial unique indexes declared below already cover lookups on
  // this field alone, and duplicating it as a second plain index just triggers Mongoose's
  // "duplicate schema index" warning for no benefit.
  @Prop({ type: Types.ObjectId, ref: 'Restaurant', default: null })
  restaurantId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Store', default: null })
  storeId: Types.ObjectId | null;

  @Prop({
    type: String,
    enum: AD_CAMPAIGN_STATUSES,
    required: true,
    default: 'pending_payment',
    index: true,
  })
  status: AdCampaignStatus;

  @Prop({
    type: String,
    enum: AD_CAMPAIGN_PAYMENT_STATUSES,
    required: true,
    default: 'pending',
  })
  paymentStatus: AdCampaignPaymentStatus;

  // Admin-chosen intent — the lifecycle sweep (or an immediate same-day activation on payment
  // success) is what actually flips scheduled -> active once this date genuinely arrives.
  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  endDate: Date;

  @Prop({ type: Number, required: true, min: 1 })
  durationDays: number;

  // Snapshot of the vendor's currency at creation time — never re-derived later, so a vendor
  // changing their listing currency afterward can't retroactively alter an already-quoted price.
  @Prop({ type: String, required: true, uppercase: true })
  currency: string;

  // Snapshot of the per-day rate actually used to compute totalPrice, kept for audit even if
  // AD_CAMPAIGN_DAILY_RATE_TABLE changes later.
  @Prop({ type: Number, required: true, min: 0 })
  dailyRate: number;

  @Prop({ type: Number, required: true, min: 0 })
  totalPrice: number;

  // true when an admin typed a custom total instead of accepting the computed
  // dailyRate * durationDays suggestion.
  @Prop({ type: Boolean, default: false })
  priceOverridden: boolean;

  @Prop({
    type: String,
    enum: ['stripe', 'paystack', 'flutterwave'],
    default: null,
  })
  paymentProvider: PaymentProvider | null;

  @Prop({ type: String, default: null })
  paymentRef: string | null;

  // Every reference ever issued across retries, same array-plus-latest-pointer shape as
  // Order.paymentRefs/paymentRef — needed by findByPaymentRef's webhook correlation.
  @Prop({ type: [String], default: [] })
  paymentRefs: string[];

  // Set when an admin records an offline payment (bank transfer, invoiced deal) via mark-paid
  // instead of the vendor completing the online checkout — the two paths converge on the exact
  // same activation logic either way.
  @Prop({ type: Boolean, default: false })
  markedPaidManually: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByAdminId: Types.ObjectId;

  @Prop({ type: Date, default: null })
  cancelledAt: Date | null;

  @Prop({ type: String, default: null })
  cancelReason: string | null;

  @Prop({ type: String, default: '', trim: true })
  adminNotes: string;
}

export type AdCampaignDocument = HydratedDocument<AdCampaign>;
export const AdCampaignSchema = SchemaFactory.createForClass(AdCampaign);

AdCampaignSchema.index({ restaurantId: 1, status: 1 });
AdCampaignSchema.index({ storeId: 1, status: 1 });
// Cron sweep queries — status leads, same "filter field leads every compound index" convention
// Restaurant/Store already use with isApproved.
AdCampaignSchema.index({ status: 1, startDate: 1 });
AdCampaignSchema.index({ status: 1, endDate: 1 });
// At most one non-terminal (pending_payment/scheduled/active) campaign per vendor, enforced
// atomically at the DB level — a partial unique index, not just an app-level pre-check, so two
// concurrent admin creates for the same vendor can't both succeed (same "atomic, race-safe"
// spirit as PromoCodesService.redeem()'s $expr-guarded updateOne, just via an index instead of a
// filtered update). AdCampaignsService.create() still pre-checks first for a clean 400 message;
// this index is the real guarantee.
AdCampaignSchema.index(
  { restaurantId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      restaurantId: { $type: 'objectId' },
      status: { $in: ['pending_payment', 'scheduled', 'active'] },
    },
  },
);
AdCampaignSchema.index(
  { storeId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      storeId: { $type: 'objectId' },
      status: { $in: ['pending_payment', 'scheduled', 'active'] },
    },
  },
);
