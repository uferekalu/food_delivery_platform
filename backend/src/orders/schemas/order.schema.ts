import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Address, AddressSchema } from '../../common/schemas/address.schema';
import { PAYMENT_PROVIDERS } from '../../payments/payment-provider';
import type { PaymentProvider } from '../../payments/payment-provider';
import { OrderItem, OrderItemSchema } from './order-item.schema';
import { ORDER_STATUSES, PAYMENT_STATUSES } from './order-status';
import type { OrderStatus, OrderPaymentStatus } from './order-status';
import {
  StatusHistoryEntry,
  StatusHistoryEntrySchema,
} from './status-history-entry.schema';

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: String, required: true, unique: true, index: true })
  orderNumber: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customerId: Types.ObjectId;

  // Which seller kind this order belongs to (docs/ROADMAP.md FDP-56) — defaults to 'restaurant'
  // so every order created before this field existed reads back correctly with no migration.
  // Exactly one of restaurantId/storeId is set, matching this value.
  @Prop({
    type: String,
    enum: ['restaurant', 'store'],
    required: true,
    default: 'restaurant',
    index: true,
  })
  sellerType: 'restaurant' | 'store';

  // No longer `required` (was, before FDP-56) — a store order has this null instead. Every
  // *restaurant* order still always has it set; nothing about existing restaurant-order data or
  // behavior changes. Field name kept as-is (not generalized to "sellerId") deliberately: it's
  // the one thing every restaurant-scoped query/aggregation in this codebase (earnings,
  // sales-report, the owner order queue) already matches on, and renaming it would mean
  // touching every one of those call sites purely for cosmetics with no behavior change.
  @Prop({
    type: Types.ObjectId,
    ref: 'Restaurant',
    default: null,
    index: true,
  })
  restaurantId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Store', default: null, index: true })
  storeId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  riderId: Types.ObjectId | null;

  @Prop({ type: [OrderItemSchema], required: true })
  items: OrderItem[];

  @Prop({ type: Number, required: true, min: 0 })
  subtotal: number;

  // Real distance-based DeliveryZone pricing (docs/ROADMAP.md FDP-15/90) — computed in
  // OrdersService via DeliveryZonesService.calculateFee, not a flat rate. serviceFee stays a flat
  // 5% of subtotal (SERVICE_FEE_RATE in orders.service.ts) — a platform fee unrelated to distance.
  @Prop({ type: Number, required: true, min: 0 })
  deliveryFee: number;

  @Prop({ type: Number, required: true, min: 0 })
  serviceFee: number;

  // Real per-currency VAT/sales-tax calculation as of docs/ROADMAP.md FDP-101 (see
  // orders/tax-resolver.ts) — 0 only for a currency with no configured rate (e.g. USD/EUR, which
  // don't identify one jurisdiction with a single accurate flat rate).
  @Prop({ type: Number, required: true, min: 0, default: 0 })
  tax: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  discount: number;

  @Prop({ type: Number, required: true, min: 0 })
  total: number;

  // Vendor payouts epic, part 1 of 4 (docs/ROADMAP.md FDP-51) — snapshotted at order creation
  // from PLATFORM_COMMISSION_RATE (backend/src/common/constants/platform-fee.ts, currently 15%)
  // in effect at the time, so a later rate change never rewrites historical orders. Settled for
  // real via the weekly batch payout (docs/ROADMAP.md FDP-92, docs/ARCHITECTURE.md §19) — see
  // vendorPayoutId below for whether this specific order's cut has actually gone out yet.
  @Prop({ type: Number, required: true, min: 0 })
  platformFeeAmount: number;

  // What the SELLER (restaurant or store, per sellerType — docs/ROADMAP.md FDP-56) is owed for
  // this order: subtotal minus platformFeeAmount. Field name kept from before stores existed,
  // same reasoning as restaurantId above.
  @Prop({ type: Number, required: true, min: 0 })
  restaurantPayoutAmount: number;

  // Weekly batch payout tracking (docs/ROADMAP.md FDP-91 onward) — `null` means "not yet paid
  // out." Two separate fields, not one, because a single DELIVERED order's earnings split two
  // ways that are settled independently: the vendor's cut (restaurantPayoutAmount) and the
  // rider's cut (deliveryFee) can land in two *different* Payout documents, on two different
  // schedules, to two different people. Stores as a plain string, like every other id field in
  // this codebase's Mongoose 9 setup (see backend/CLAUDE.md's ObjectId note) — never query with
  // a raw ObjectId.
  @Prop({ type: String, default: null, index: true })
  vendorPayoutId: string | null;

  @Prop({ type: String, default: null, index: true })
  riderPayoutId: string | null;

  // Set once, by `OrdersService.setPaymentRef`, from whether `PaymentsService.initiatePayment`
  // actually applied a provider-side split for this order's *latest* payment attempt (docs/
  // ROADMAP.md FDP-92) — true only when the seller had an active payout account for the provider
  // used, meaning the provider itself already sent the vendor their cut automatically at charge
  // time. Critical for the weekly-batch payout rollout: `PayoutsService.getUnpaidVendorEarnings`
  // excludes any order with this set, so the same order's vendor cut is never paid out a SECOND
  // time by the batch job on top of what the instant split already sent — both mechanisms run in
  // parallel during the staged rollout (docs/ARCHITECTURE.md §14), and this flag is what keeps
  // them from double-paying each other. Never set for a rider — riders have no instant-split
  // mechanism, so `riderPayoutId`/`getUnpaidRiderEarnings` has no equivalent collision to guard
  // against.
  @Prop({ type: Boolean, default: false })
  settledViaInstantSplit: boolean;

  // Copied from the restaurant at order time (docs/ARCHITECTURE.md §3) — the platform never
  // does cross-currency conversion, so this never needs to be recomputed later.
  @Prop({ type: String, required: true })
  currency: string;

  @Prop({
    type: String,
    enum: ORDER_STATUSES,
    required: true,
    default: 'PENDING_PAYMENT',
  })
  status: OrderStatus;

  @Prop({ type: [StatusHistoryEntrySchema], default: [] })
  statusHistory: StatusHistoryEntry[];

  @Prop({ type: String, enum: PAYMENT_PROVIDERS, required: true })
  paymentProvider: PaymentProvider;

  @Prop({
    type: String,
    enum: PAYMENT_STATUSES,
    required: true,
    default: 'pending',
  })
  paymentStatus: OrderPaymentStatus;

  @Prop({ type: String, default: null })
  paymentRef: string | null;

  // Every reference ever issued for this order, not just the current one (docs/ROADMAP.md
  // FDP-65) — initiatePayment can be called more than once for the same PENDING_PAYMENT order
  // (a retry, or switching provider), and `paymentRef` above only ever holds the latest. Without
  // this, a webhook for an *earlier*, now-orphaned checkout session that the customer actually
  // completed would look up a reference findByPaymentRef can no longer find, silently stranding
  // an order that was genuinely paid for.
  @Prop({ type: [String], default: [] })
  paymentRefs: string[];

  @Prop({ type: AddressSchema, required: true })
  deliveryAddress: Address;

  @Prop({ type: String, default: '', trim: true, maxlength: 500 })
  deliveryInstructions: string;

  // null = ASAP.
  @Prop({ type: Date, default: null })
  scheduledFor: Date | null;

  @Prop({ type: Date, default: null })
  estimatedDeliveryAt: Date | null;

  // Set exactly once, the moment the order transitions to DELIVERED
  // (OrdersService.updateStatusByRider) — distinct from statusHistory (which also records this
  // moment as an entry) so date-range sales reporting (docs/ROADMAP.md FDP-64) can $match/index
  // on a top-level scalar field instead of unwinding statusHistory for every query. Left set
  // (never cleared) if the order later moves DELIVERED → REFUNDED — it genuinely was delivered
  // on this date, the report excludes REFUNDED orders from revenue by filtering on `status`,
  // not by clearing this field.
  @Prop({ type: Date, default: null, index: true })
  deliveredAt: Date | null;

  @Prop({ type: String, default: null })
  promoCode: string | null;

  // Refund-hardening pass (docs/ROADMAP.md FDP-104, docs/ARCHITECTURE.md §28) — set only when a
  // refund attempt threw a provider-side RefundOutcomeUnknownError (a network-layer failure where
  // the reversal may or may not have actually happened). `status` is reverted to its pre-attempt
  // value in this case (never left falsely showing REFUNDED), and PaymentsService.refundOrder
  // refuses to retry while this is true — an admin must resolve it first via
  // OrdersService.resolveRefundReconciliation, the same human-in-the-loop pattern
  // Payout.reconciliationRequired already uses on the payout side.
  @Prop({ type: Boolean, default: false, index: true })
  refundReconciliationRequired: boolean;

  @Prop({ type: String, default: null })
  refundFailureReason: string | null;

  // Set when a provider reports a chargeback/dispute (docs/ROADMAP.md FDP-104) via
  // PaymentsService.handleRefundWebhook — informational only. This codebase never submits dispute
  // evidence; an admin resolves the actual dispute directly in the provider's own dashboard, this
  // flag just makes sure it doesn't go unnoticed.
  @Prop({ type: Boolean, default: false, index: true })
  disputeFlagged: boolean;
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);
