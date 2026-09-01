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

  @Prop({
    type: Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true,
  })
  restaurantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  riderId: Types.ObjectId | null;

  @Prop({ type: [OrderItemSchema], required: true })
  items: OrderItem[];

  @Prop({ type: Number, required: true, min: 0 })
  subtotal: number;

  // Flat placeholder fees (see docs/ROADMAP.md FDP-15 — real DeliveryZone-based calculation
  // replaces this once geo/zone data exists) — 10%/5% of subtotal respectively, computed in
  // OrdersService, not hardcoded per-currency amounts (which would be meaningless across
  // currencies with very different unit values).
  @Prop({ type: Number, required: true, min: 0 })
  deliveryFee: number;

  @Prop({ type: Number, required: true, min: 0 })
  serviceFee: number;

  // Real tax calculation is out of scope — jurisdiction-specific rules vary too much to fake
  // meaningfully at this stage. Always 0 for now.
  @Prop({ type: Number, required: true, min: 0, default: 0 })
  tax: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  discount: number;

  @Prop({ type: Number, required: true, min: 0 })
  total: number;

  // Vendor payouts epic, part 1 of 4 (docs/ROADMAP.md FDP-51) — snapshotted at order creation
  // from the platform commission rate in effect at the time (OrdersService.PLATFORM_COMMISSION_RATE),
  // so a later rate change never rewrites historical orders. restaurantPayoutAmount is what the
  // restaurant is owed for this order (subtotal minus the platform's commission) — settled
  // automatically by the payment provider once FDP-52/53/54 wire up real subaccount/Connect
  // splits; until then it's informational only (see Restaurant.payoutAccounts).
  @Prop({ type: Number, required: true, min: 0 })
  platformFeeAmount: number;

  @Prop({ type: Number, required: true, min: 0 })
  restaurantPayoutAmount: number;

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

  @Prop({ type: AddressSchema, required: true })
  deliveryAddress: Address;

  @Prop({ type: String, default: '', trim: true, maxlength: 500 })
  deliveryInstructions: string;

  // null = ASAP.
  @Prop({ type: Date, default: null })
  scheduledFor: Date | null;

  @Prop({ type: Date, default: null })
  estimatedDeliveryAt: Date | null;

  @Prop({ type: String, default: null })
  promoCode: string | null;
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);
