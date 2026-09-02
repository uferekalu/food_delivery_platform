import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CartService } from '../cart/cart.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { MenuItem, MenuItemDocument } from '../menu/schemas/menu-item.schema';
import { PromoCodesService } from '../promo-codes/promo-codes.service';
import { PaymentProviderResolver } from '../payments/provider-resolver';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { generateOrderNumber } from '../common/utils/order-number';
import { PLATFORM_COMMISSION_RATE } from '../common/constants/platform-fee';
import { Order, OrderDocument } from './schemas/order.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { canOwnerTransition, canRiderTransition } from './order-state-machine';
import { ORDER_STATUSES } from './schemas/order-status';
import type { OrderStatus } from './schemas/order-status';
import type { PaymentProvider } from '../payments/payment-provider';

// Customer-facing copy for each status a notification is sent for — every entry here also
// gets an in-app row + email; only OUT_FOR_DELIVERY/DELIVERED additionally go out over SMS
// (docs/ROADMAP.md FDP-19), since those are the two moments customers most want to know about
// even without opening the app. Statuses with no entry (none currently) simply don't notify.
const ORDER_STATUS_MESSAGES: Partial<
  Record<OrderStatus, { title: string; body: (order: OrderDocument) => string }>
> = {
  PLACED: {
    title: 'Order confirmed',
    body: (order) =>
      `Your order ${order.orderNumber} has been confirmed and sent to the restaurant.`,
  },
  ACCEPTED_BY_RESTAURANT: {
    title: 'Order accepted',
    body: (order) =>
      `Order ${order.orderNumber} has been accepted and will be prepared shortly.`,
  },
  PREPARING: {
    title: 'Order being prepared',
    body: (order) =>
      `The restaurant is preparing your order ${order.orderNumber}.`,
  },
  READY_FOR_PICKUP: {
    title: 'Order ready for pickup',
    body: (order) =>
      `Your order ${order.orderNumber} is ready and waiting for a rider.`,
  },
  ASSIGNED_TO_RIDER: {
    title: 'Rider assigned',
    body: (order) =>
      `A rider has been assigned to deliver order ${order.orderNumber}.`,
  },
  PICKED_UP: {
    title: 'Order picked up',
    body: (order) =>
      `Your order ${order.orderNumber} has been picked up and is on its way.`,
  },
  OUT_FOR_DELIVERY: {
    title: 'Out for delivery',
    body: (order) => `Your order ${order.orderNumber} is out for delivery.`,
  },
  DELIVERED: {
    title: 'Order delivered',
    body: (order) =>
      `Your order ${order.orderNumber} has been delivered. Enjoy!`,
  },
  CANCELLED: {
    title: 'Order cancelled',
    body: (order) => `Your order ${order.orderNumber} has been cancelled.`,
  },
  REFUNDED: {
    title: 'Order refunded',
    body: (order) => `Your order ${order.orderNumber} has been refunded.`,
  },
};

const SMS_NOTIFIED_STATUSES: OrderStatus[] = ['OUT_FOR_DELIVERY', 'DELIVERED'];

// Statuses a restaurant owner still needs to act on — what their "live order queue" shows.
// Excludes PENDING_PAYMENT (not actionable until FDP-14's webhook moves it to PLACED) and every
// terminal/rider-stage status (nothing left for the restaurant to do).
const ACTIVE_RESTAURANT_STATUSES: OrderStatus[] = [
  'PLACED',
  'ACCEPTED_BY_RESTAURANT',
  'PREPARING',
  'READY_FOR_PICKUP',
];

// deliveryFee is real distance-based DeliveryZone pricing as of FDP-15 (see
// DeliveryZonesService.calculateFee) — this flat rate only applies to serviceFee, which is a
// platform fee unrelated to distance.
const SERVICE_FEE_RATE = 0.05;

// Order statuses from which a captured payment can still be reversed (docs/ROADMAP.md FDP-65).
// DELIVERED is the normal post-delivery dispute/refund case. CANCELLED was added after finding
// there was previously no way to ever refund an order the restaurant cancels *after* payment
// already succeeded but *before* delivery (PLACED/ACCEPTED_BY_RESTAURANT/PREPARING →
// CANCELLED, allowed by OWNER_TRIGGERABLE_TRANSITIONS) — CANCELLED being terminal in
// order-state-machine.ts meant the charge could never be reversed through this codebase at all.
export const REFUNDABLE_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED'];

// Money helper, exported for reuse (orders.controller.ts's CSV export) rather than
// re-duplicated. `+ Number.EPSILON` before rounding (docs/ROADMAP.md FDP-65) — IEEE-754 doubles
// represent many two-decimal values inexactly (1.5 * 0.15 === 0.22499999999999998, not 0.225),
// so a plain `Math.round(value * 100) / 100` silently rounds DOWN a real fraction of monetary
// values by a full cent instead of to the nearest cent. This is the standard, minimal mitigation
// for that specific class of float error; it is not a general arbitrary-precision fix, but it
// resolves every case actually reachable from this codebase's fee/discount arithmetic.
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Sales report types (docs/ROADMAP.md FDP-64) — named interfaces rather than inlining, since
// the shape is meaningfully larger than getEarningsSummary's and is also the CSV export's
// column source.
export interface SalesReportItemBreakdown {
  menuItemId: string;
  name: string;
  qtySold: number;
  revenue: number;
  cogs: number;
  profit: number;
  /** null when revenue is 0 for this item in range — dividing by zero isn't a meaningful margin. */
  marginPct: number | null;
  /** True when at least one unit sold in range came from an OrderItem with no costPrice
   * snapshot — this item's `cogs`/`profit` above are understated, not wrong-but-complete. */
  hasIncompleteCostData: boolean;
}

export interface SalesReportDayBreakdown {
  /** YYYY-MM-DD, UTC (matches $dateToString's default timezone). */
  date: string;
  orders: number;
  revenue: number;
  cogs: number;
  profit: number;
}

export interface SalesReport {
  currency: string;
  range: { from: Date | null; to: Date | null };
  totals: {
    orders: number;
    revenue: number;
    deliveryFeeTotal: number;
    serviceFeeTotal: number;
    discountTotal: number;
    platformFeeTotal: number;
    netEarned: number;
    totalCollected: number;
    cogs: number;
    grossProfit: number;
    grossMarginPct: number | null;
    avgOrderValue: number;
  };
  /** Distinct item names with at least one sale in range lacking a cost-price snapshot — surfaced
   * up front so the owner sees the COGS/profit figures are incomplete before trusting them. */
  itemsMissingCostPrice: string[];
  byItem: SalesReportItemBreakdown[];
  byDay: SalesReportDayBreakdown[];
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItemDocument>,
    private readonly cartService: CartService,
    private readonly restaurantsService: RestaurantsService,
    private readonly promoCodesService: PromoCodesService,
    private readonly paymentProviderResolver: PaymentProviderResolver,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly deliveryZonesService: DeliveryZonesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Fire-and-forget: notification delivery (in-app write + best-effort email/SMS) never blocks
   * or fails an order transition that has already been committed and broadcast. */
  private notifyOrderStatus(order: OrderDocument): void {
    const message = ORDER_STATUS_MESSAGES[order.status];
    if (!message) return;
    const body = message.body(order);

    this.notificationsService
      .notify({
        userId: order.customerId.toString(),
        type: order.status === 'PLACED' ? 'order_placed' : 'order_status',
        title: message.title,
        body,
        metadata: { orderId: order._id.toString(), status: order.status },
        email: {
          subject: `${message.title} — ${order.orderNumber}`,
          html: `<p>${body}</p>`,
        },
        sms: SMS_NOTIFIED_STATUSES.includes(order.status) ? body : undefined,
      })
      .catch((err: Error) =>
        this.logger.error(
          `Order status notification failed for order ${order._id.toString()}: ${err.message}`,
        ),
      );
  }

  private notifyNewOrderToOwner(order: OrderDocument): void {
    this.restaurantsService
      .findByIdOrThrow(order.restaurantId.toString())
      .then((restaurant) => {
        const body = `New order ${order.orderNumber} for ${order.currency} ${order.total.toFixed(2)} just came in.`;
        return this.notificationsService.notify({
          userId: restaurant.ownerId.toString(),
          type: 'new_order',
          title: 'New order received',
          body,
          metadata: { orderId: order._id.toString() },
          email: {
            subject: `New order — ${order.orderNumber}`,
            html: `<p>${body}</p>`,
          },
        });
      })
      .catch((err: Error) =>
        this.logger.error(
          `New-order notification failed for order ${order._id.toString()}: ${err.message}`,
        ),
      );
  }

  private notifyPaymentFailed(order: OrderDocument): void {
    const body = `We couldn't process payment for order ${order.orderNumber}. Please try again or use a different payment method.`;
    this.notificationsService
      .notify({
        userId: order.customerId.toString(),
        type: 'payment_failed',
        title: 'Payment failed',
        body,
        metadata: { orderId: order._id.toString() },
        email: {
          subject: `Payment failed — ${order.orderNumber}`,
          html: `<p>${body}</p>`,
        },
      })
      .catch((err: Error) =>
        this.logger.error(
          `Payment-failed notification failed for order ${order._id.toString()}: ${err.message}`,
        ),
      );
  }

  async createOrder(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<OrderDocument> {
    const cart = await this.cartService.getCart(userId);
    if (!cart.restaurantId || cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    const restaurant = await this.restaurantsService.findByIdOrThrow(
      cart.restaurantId,
    );
    if (!restaurant.isApproved || !restaurant.isOpen) {
      throw new BadRequestException(
        'This restaurant is no longer accepting orders — please review your cart',
      );
    }

    // Every cart item's price/modifier-priceDelta was already server-resolved and snapshotted
    // at add-to-cart time (never client-editable) — re-trusting that snapshot here is a
    // deliberate "price protection while shopping" choice, not a gap: it means a price change
    // the owner makes mid-session doesn't retroactively reprice what's already in the cart.
    // What DOES need a fresh check is availability — an item can go unavailable after being
    // added but before checkout.
    const menuItemSnapshots = await this.menuItemModel
      .find(
        { _id: { $in: cart.items.map((i) => i.menuItemId) } },
        { isAvailable: 1, costPrice: 1 },
      )
      .exec();
    const unavailable = cart.items.find((item) => {
      const current = menuItemSnapshots.find(
        (a) => a._id.toString() === item.menuItemId.toString(),
      );
      return !current || !current.isAvailable;
    });
    if (unavailable) {
      throw new BadRequestException(
        `"${unavailable.name}" is no longer available — please review your cart`,
      );
    }

    if (
      dto.scheduledFor &&
      new Date(dto.scheduledFor).getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'Scheduled delivery time must be in the future',
      );
    }

    const subtotal = cart.subtotal;
    const deliveryFee = await this.deliveryZonesService.calculateFee(
      restaurant,
      dto.deliveryAddress,
      subtotal,
    );
    const serviceFee = round2(subtotal * SERVICE_FEE_RATE);
    const tax = 0;
    // Vendor payouts epic (docs/ROADMAP.md FDP-51 onward) — the platform's commission on the
    // food subtotal only, not deliveryFee (the rider's earnings, see findForRider) or
    // serviceFee (already the platform's own revenue line). Computed on the pre-discount
    // subtotal: a promo discount is a platform marketing cost, not something passed on to
    // reduce what the restaurant is owed. Snapshotted onto the order at creation (like
    // serviceFee) so a later rate change never rewrites historical orders' numbers.
    const platformFeeAmount = round2(subtotal * PLATFORM_COMMISSION_RATE);
    const restaurantPayoutAmount = round2(subtotal - platformFeeAmount);

    let discount = 0;
    let redeemedPromoCodeId: string | null = null;
    if (dto.promoCode) {
      const validation = await this.promoCodesService.validate(
        dto.promoCode,
        cart.restaurantId,
        subtotal,
      );
      if (!validation.valid) throw new BadRequestException(validation.reason);
      discount = round2(validation.discountAmount);
      redeemedPromoCodeId = validation.promoCodeId;
    }

    const total = Math.max(
      0,
      round2(subtotal + deliveryFee + serviceFee + tax - discount),
    );
    const paymentProvider = this.paymentProviderResolver.resolveDefault(
      restaurant.currency,
    );

    const order = await this.orderModel.create({
      orderNumber: generateOrderNumber(),
      customerId: userId,
      restaurantId: cart.restaurantId,
      items: cart.items.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        price: item.price,
        // Sales-report COGS (docs/ROADMAP.md FDP-64) — snapshotted here, not looked up live at
        // report time, same "protect against later edits" reasoning as `price`/`name` above.
        // null (not 0) when the menu item has no cost price set, so the report can tell "no
        // cost data" apart from "this item genuinely costs nothing".
        costPrice:
          menuItemSnapshots.find(
            (m) => m._id.toString() === item.menuItemId.toString(),
          )?.costPrice ?? null,
        imageUrl: item.imageUrl,
        qty: item.qty,
        selectedModifiers: item.selectedModifiers,
        notes: item.notes,
      })),
      subtotal,
      deliveryFee,
      serviceFee,
      tax,
      discount,
      total,
      platformFeeAmount,
      restaurantPayoutAmount,
      currency: restaurant.currency,
      status: 'PENDING_PAYMENT',
      statusHistory: [
        { status: 'PENDING_PAYMENT', at: new Date(), by: userId },
      ],
      paymentProvider,
      paymentStatus: 'pending',
      paymentRef: null,
      deliveryAddress: dto.deliveryAddress,
      deliveryInstructions: dto.deliveryInstructions?.trim() ?? '',
      scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
      estimatedDeliveryAt: null,
      promoCode: dto.promoCode ?? null,
    });

    if (redeemedPromoCodeId)
      await this.promoCodesService.redeem(redeemedPromoCodeId);
    await this.cartService.clearCart(userId);

    return order;
  }

  async findOne(userId: string, orderId: string): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }
    return order;
  }

  findMine(userId: string): Promise<OrderDocument[]> {
    return this.orderModel
      .find({ customerId: userId })
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Unrestricted lookup for admin tooling (dispute/refund handling, docs/ROADMAP.md FDP-20) —
   * no ownership check, unlike `findOne`. The caller is responsible for admin-gating (the
   * `@Roles('admin')` route this backs), not this method. */
  async adminFindOrThrow(orderId: string): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** The restaurant owner's live order queue — orders still awaiting some action from them,
   * oldest first (a queue is processed in the order it was received, not newest-first). */
  async findForRestaurant(
    requester: AccessTokenPayload,
    restaurantId: string,
  ): Promise<OrderDocument[]> {
    const restaurant =
      await this.restaurantsService.findByIdOrThrow(restaurantId);
    this.restaurantsService.assertOwnerOrAdmin(restaurant, requester);

    return this.orderModel
      .find({ restaurantId, status: { $in: ACTIVE_RESTAURANT_STATUSES } })
      .sort({ createdAt: 1 })
      .exec();
  }

  /** The restaurant owner's accept/reject/prepare/ready actions (docs/ROADMAP.md FDP-13) — see
   * order-state-machine.ts for exactly which transitions this allows and why
   * PENDING_PAYMENT→PLACED and every rider-stage transition are deliberately excluded. */
  async updateStatusByOwner(
    requester: AccessTokenPayload,
    orderId: string,
    targetStatus: OrderStatus,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');

    const restaurant = await this.restaurantsService.findByIdOrThrow(
      order.restaurantId.toString(),
    );
    this.restaurantsService.assertOwnerOrAdmin(restaurant, requester);

    if (!canOwnerTransition(order.status, targetStatus)) {
      throw new BadRequestException(
        `Cannot move an order from ${order.status} to ${targetStatus}`,
      );
    }

    order.status = targetStatus;
    order.statusHistory.push({
      status: targetStatus,
      at: new Date(),
      by: requester.sub,
    });
    await order.save();

    this.realtimeGateway.emitOrderStatusChanged(order);
    this.notifyOrderStatus(order);
    return order;
  }

  /** The platform-wide rider queue (docs/ROADMAP.md FDP-16) — not restaurant-scoped, since a
   * rider can pick up from any restaurant. Oldest first, same "process in received order"
   * rationale as `findForRestaurant`. */
  findUnassignedForRiders(): Promise<OrderDocument[]> {
    return this.orderModel
      .find({ status: 'READY_FOR_PICKUP', riderId: null })
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * A rider claiming an unassigned order — sets `riderId` and transitions
   * `READY_FOR_PICKUP` → `ASSIGNED_TO_RIDER` in one atomic update, filtered on the order still
   * being unassigned. Two riders tapping "Accept" on the same order at the same moment is a
   * real race (unlike the single-owner queue actions above); only the update that actually
   * matches `riderId: null` wins, so the loser gets a clear "already assigned" error instead of
   * silently overwriting the winner's claim.
   */
  async assignToRider(
    riderUserId: string,
    orderId: string,
  ): Promise<OrderDocument> {
    const order = await this.orderModel
      .findOneAndUpdate(
        { _id: orderId, status: 'READY_FOR_PICKUP', riderId: null },
        {
          $set: { riderId: riderUserId, status: 'ASSIGNED_TO_RIDER' },
          $push: {
            statusHistory: {
              status: 'ASSIGNED_TO_RIDER',
              at: new Date(),
              by: riderUserId,
            },
          },
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!order) {
      const exists = await this.orderModel.exists({ _id: orderId }).exec();
      if (!exists) throw new NotFoundException('Order not found');
      throw new BadRequestException(
        'This order was already picked up by another rider, or is no longer ready for pickup',
      );
    }

    this.realtimeGateway.emitOrderStatusChanged(order);
    this.notifyOrderStatus(order);
    return order;
  }

  /** A rider's picked-up/out-for-delivery/delivered progress updates (docs/ROADMAP.md FDP-16) —
   * see order-state-machine.ts's RIDER_TRIGGERABLE_TRANSITIONS for exactly what this allows. */
  async updateStatusByRider(
    riderUserId: string,
    orderId: string,
    targetStatus: OrderStatus,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');

    if (order.riderId?.toString() !== riderUserId) {
      throw new ForbiddenException(
        'You are not the rider assigned to this order',
      );
    }

    if (!canRiderTransition(order.status, targetStatus)) {
      throw new BadRequestException(
        `Cannot move an order from ${order.status} to ${targetStatus}`,
      );
    }

    const now = new Date();
    order.status = targetStatus;
    order.statusHistory.push({
      status: targetStatus,
      at: now,
      by: riderUserId,
    });
    // Sales-report date-range filtering (docs/ROADMAP.md FDP-64) — see Order.deliveredAt's doc
    // comment for why this is a separate top-level field rather than derived from
    // statusHistory on every report query.
    if (targetStatus === 'DELIVERED') order.deliveredAt = now;
    await order.save();

    this.realtimeGateway.emitOrderStatusChanged(order);
    this.notifyOrderStatus(order);
    return order;
  }

  /** A rider's own delivery history — every order ever assigned to them, newest first. Doubles
   * as the earnings source: the frontend sums `deliveryFee` over the `DELIVERED` ones rather
   * than this service tracking a separate payout/commission model, which nothing in
   * docs/ROADMAP.md FDP-16 calls for. */
  findForRider(riderUserId: string): Promise<OrderDocument[]> {
    return this.orderModel
      .find({ riderId: riderUserId })
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Records which provider/reference an in-flight payment attempt is using — called right
   * after `PaymentsService` creates the provider-hosted checkout session, before the customer
   * has actually paid, so a later webhook delivery can look the order back up by reference.
   * Appends to `paymentRefs` rather than only overwriting `paymentRef` (docs/ROADMAP.md FDP-65)
   * — `initiatePayment` can be called more than once for the same still-`PENDING_PAYMENT` order
   * (a retry, or switching provider), and a customer who completes payment on an *earlier*
   * session must not become unfindable once a later attempt overwrites the single `paymentRef`
   * field. */
  async setPaymentRef(
    order: OrderDocument,
    provider: PaymentProvider,
    paymentRef: string,
  ): Promise<OrderDocument> {
    order.paymentProvider = provider;
    order.paymentRef = paymentRef;
    order.paymentRefs.push(paymentRef);
    return order.save();
  }

  /** Matches on `paymentRefs` (every reference ever issued) primarily, with a `paymentRef`
   * fallback for orders that predate that field ever being populated — see `setPaymentRef`. */
  findByPaymentRef(reference: string): Promise<OrderDocument | null> {
    return this.orderModel
      .findOne({ $or: [{ paymentRefs: reference }, { paymentRef: reference }] })
      .exec();
  }

  /**
   * The *only* place `PENDING_PAYMENT` → `PLACED` happens (see order-state-machine.ts) —
   * called exclusively from `PaymentsService` after a webhook signature has been verified.
   * Idempotent: providers retry webhook delivery, and a second delivery for an order that's
   * already past `PENDING_PAYMENT` is a silent no-op, not an error.
   *
   * Uses an atomic `findOneAndUpdate` filtered on the *current* status (docs/ROADMAP.md FDP-65)
   * rather than a plain findById-then-save — this method is deliberately designed to race the
   * client-triggered `verifyPayment` active-poll (see that method's own doc comment: "whichever
   * of the two arrives first wins... a safe no-op"), and a non-atomic read-then-write let both
   * sides read `PENDING_PAYMENT` before either wrote, so both proceeded: two `PLACED`
   * `statusHistory` entries and duplicate customer/owner notifications instead of the promised
   * no-op. Only the update that actually flips the filtered document emits/notifies.
   */
  async markPaidFromWebhook(orderId: string): Promise<OrderDocument | null> {
    const updated = await this.orderModel
      .findOneAndUpdate(
        { _id: orderId, status: 'PENDING_PAYMENT' },
        {
          $set: { paymentStatus: 'succeeded', status: 'PLACED' },
          $push: {
            statusHistory: { status: 'PLACED', at: new Date(), by: 'system' },
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) return this.orderModel.findById(orderId).exec();

    this.realtimeGateway.emitOrderStatusChanged(updated);
    this.notifyOrderStatus(updated);
    this.notifyNewOrderToOwner(updated);
    return updated;
  }

  /** A failed/declined payment attempt — the order stays in `PENDING_PAYMENT` so the customer
   * can retry (possibly with a different provider), it just stops looking like a silent hang. */
  async markPaymentFailed(orderId: string): Promise<OrderDocument | null> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) return null;
    // Never downgrade a payment that another webhook already resolved as final — provider
    // webhook delivery order isn't guaranteed, and this specifically must not undo a completed
    // refund either (docs/ROADMAP.md FDP-65: a late/duplicate "failed" event for an already-
    // refunded order previously slipped through and overwrote paymentStatus to 'failed' while
    // status stayed REFUNDED, an inconsistent combination that also dropped the order from
    // getAnalyticsSummary's revenue total).
    if (order.paymentStatus === 'succeeded' || order.paymentStatus === 'refunded') {
      return order;
    }

    order.paymentStatus = 'failed';
    await order.save();

    this.realtimeGateway.emitOrderStatusChanged(order);
    this.notifyPaymentFailed(order);
    return order;
  }

  /**
   * Refund flow, part 1/3 (docs/ROADMAP.md FDP-65 — replaces the old single-step `markRefunded`,
   * called exclusively from `PaymentsService.refundOrder`). Atomically claims the order for
   * refunding by flipping `status` straight to `REFUNDED` *before* the provider has actually
   * been asked to reverse the charge — `findOneAndUpdate`'s single-document atomicity is the
   * concurrency guard: of two near-simultaneous refund attempts (an admin double-click, or a
   * client retry), only one can match `status: {$in: REFUNDABLE_STATUSES}`, since the winner's
   * update already moved status off of it before the loser's filter is evaluated by MongoDB.
   * The loser gets `null` back and must not call the provider. Always pair with `finalizeRefund`
   * (provider call succeeded) or `revertFailedRefundClaim` (it didn't) — never call the provider
   * before this resolves, and never leave a claimed order without calling one of the two.
   */
  async claimForRefund(orderId: string): Promise<OrderDocument | null> {
    return this.orderModel
      .findOneAndUpdate(
        {
          _id: orderId,
          status: { $in: REFUNDABLE_STATUSES },
          paymentStatus: 'succeeded',
        },
        { $set: { status: 'REFUNDED' } },
      )
      .exec(); // default {new: false} — the caller needs the PRE-update doc's status to revert to
  }

  /** Refund flow, part 2/3 (success path) — the provider has actually reversed the charge,
   * finalize the claim from `claimForRefund` into a real refunded order. */
  async finalizeRefund(orderId: string): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');

    order.paymentStatus = 'refunded';
    order.statusHistory.push({
      status: 'REFUNDED',
      at: new Date(),
      by: 'admin',
    });
    await order.save();

    this.realtimeGateway.emitOrderStatusChanged(order);
    this.notifyOrderStatus(order);
    return order;
  }

  /** Refund flow, part 3/3 (failure path) — the provider rejected the refund *after*
   * `claimForRefund` already flipped `status` to `REFUNDED`; put it back exactly where it was so
   * the order isn't left permanently mislabeled as refunded when no money actually moved. Only
   * reverts while still mid-claim (`paymentStatus` is still `'succeeded'`, i.e. `finalizeRefund`
   * never ran) — this can never overwrite a refund that genuinely completed in the meantime. */
  async revertFailedRefundClaim(
    orderId: string,
    previousStatus: OrderStatus,
  ): Promise<void> {
    await this.orderModel
      .updateOne(
        { _id: orderId, status: 'REFUNDED', paymentStatus: 'succeeded' },
        { $set: { status: previousStatus } },
      )
      .exec();
  }

  /**
   * A restaurant owner's earnings — vendor payouts epic, part 1 of 4 (docs/ROADMAP.md FDP-51).
   * Only counts DELIVERED orders (money the restaurant has actually, finally earned — a later
   * refund moves an order to REFUNDED, a separate terminal state, so it naturally drops out
   * here). `payoutSetupComplete` reflects whether *any* provider has an active payout account
   * yet — until FDP-52/53/54 wire up real onboarding, this is always false and every
   * restaurant's dashboard shows "payout setup required" instead of a withdraw action.
   */
  async getEarningsSummary(
    requester: AccessTokenPayload,
    restaurantId: string,
  ): Promise<{
    currency: string;
    deliveredOrders: number;
    grossRevenue: number;
    platformFeeTotal: number;
    netEarned: number;
    payoutSetupComplete: boolean;
  }> {
    const restaurant =
      await this.restaurantsService.findByIdOrThrow(restaurantId);
    this.restaurantsService.assertOwnerOrAdmin(restaurant, requester);

    const [summary] = await this.orderModel
      .aggregate<{
        deliveredOrders: number;
        grossRevenue: number;
        platformFeeTotal: number;
        netEarned: number;
      }>([
        // .toString(), never the raw ObjectId — ref fields in this schema store as strings
        // (Mongoose 9 quirk hit repeatedly elsewhere in this codebase), and aggregate's $match
        // doesn't auto-cast the way .find()/.findOne() do.
        {
          $match: {
            restaurantId: restaurant._id.toString(),
            status: 'DELIVERED',
          },
        },
        {
          $group: {
            _id: null,
            deliveredOrders: { $sum: 1 },
            grossRevenue: { $sum: '$subtotal' },
            platformFeeTotal: { $sum: '$platformFeeAmount' },
            netEarned: { $sum: '$restaurantPayoutAmount' },
          },
        },
      ])
      .exec();

    return {
      currency: restaurant.currency,
      deliveredOrders: summary?.deliveredOrders ?? 0,
      grossRevenue: summary?.grossRevenue ?? 0,
      platformFeeTotal: summary?.platformFeeTotal ?? 0,
      netEarned: summary?.netEarned ?? 0,
      payoutSetupComplete: restaurant.payoutAccounts.some(
        (account) => account.status === 'active',
      ),
    };
  }

  /**
   * A restaurant owner's detailed sales report (docs/ROADMAP.md FDP-64) — date-range filterable
   * revenue/COGS/profit, broken down by item and by day. Same "only DELIVERED orders count"
   * convention as getEarningsSummary above, filtered on `deliveredAt` rather than `createdAt`
   * (a scheduled order placed in one period but delivered in another belongs to the period it
   * was actually fulfilled in). COGS is computed from each OrderItem's snapshotted `costPrice`,
   * which is null for any item that had no cost price set at order time — those contribute 0 to
   * COGS (never silently treated as free), and are surfaced separately via
   * `itemsMissingCostPrice`/`hasIncompleteCostData` so the owner knows the profit figures are
   * incomplete rather than trusting a number that understates true cost.
   */
  async getSalesReport(
    requester: AccessTokenPayload,
    restaurantId: string,
    from?: Date,
    to?: Date,
  ): Promise<SalesReport> {
    const restaurant =
      await this.restaurantsService.findByIdOrThrow(restaurantId);
    this.restaurantsService.assertOwnerOrAdmin(restaurant, requester);

    const [result] = await this.orderModel
      .aggregate<{
        totals: {
          orders: number;
          revenue: number;
          deliveryFeeTotal: number;
          serviceFeeTotal: number;
          discountTotal: number;
          platformFeeTotal: number;
          netEarned: number;
          totalCollected: number;
        }[];
        itemStats: {
          _id: string;
          name: string;
          qtySold: number;
          revenue: number;
          cogs: number;
          missingCostQty: number;
        }[];
        dayStats: { _id: string; orders: number; revenue: number }[];
        dayCogsStats: { _id: string; cogs: number }[];
      }>([
        {
          $match: this.deliveredOrdersMatch(
            restaurant._id.toString(),
            from,
            to,
          ),
        },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  orders: { $sum: 1 },
                  revenue: { $sum: '$subtotal' },
                  deliveryFeeTotal: { $sum: '$deliveryFee' },
                  serviceFeeTotal: { $sum: '$serviceFee' },
                  discountTotal: { $sum: '$discount' },
                  platformFeeTotal: { $sum: '$platformFeeAmount' },
                  netEarned: { $sum: '$restaurantPayoutAmount' },
                  totalCollected: { $sum: '$total' },
                },
              },
            ],
            itemStats: [
              { $unwind: '$items' },
              {
                $group: {
                  _id: '$items.menuItemId',
                  name: { $first: '$items.name' },
                  qtySold: { $sum: '$items.qty' },
                  revenue: {
                    $sum: { $multiply: ['$items.price', '$items.qty'] },
                  },
                  cogs: {
                    $sum: {
                      $cond: [
                        { $eq: ['$items.costPrice', null] },
                        0,
                        { $multiply: ['$items.costPrice', '$items.qty'] },
                      ],
                    },
                  },
                  missingCostQty: {
                    $sum: {
                      $cond: [
                        { $eq: ['$items.costPrice', null] },
                        '$items.qty',
                        0,
                      ],
                    },
                  },
                },
              },
              { $sort: { revenue: -1 } },
            ],
            dayStats: [
              {
                $group: {
                  _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$deliveredAt' },
                  },
                  orders: { $sum: 1 },
                  revenue: { $sum: '$subtotal' },
                },
              },
              { $sort: { _id: 1 } },
            ],
            dayCogsStats: [
              { $unwind: '$items' },
              {
                $group: {
                  _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$deliveredAt' },
                  },
                  cogs: {
                    $sum: {
                      $cond: [
                        { $eq: ['$items.costPrice', null] },
                        0,
                        { $multiply: ['$items.costPrice', '$items.qty'] },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      ])
      .exec();

    const totals = result?.totals[0];
    const revenue = totals?.revenue ?? 0;
    const cogs = round2(
      (result?.itemStats ?? []).reduce((sum, item) => sum + item.cogs, 0),
    );
    const grossProfit = round2(revenue - cogs);
    const orders = totals?.orders ?? 0;

    const cogsByDay = new Map(
      (result?.dayCogsStats ?? []).map((d) => [d._id, d.cogs]),
    );
    const byDay: SalesReportDayBreakdown[] = (result?.dayStats ?? []).map(
      (d) => {
        const dayCogs = round2(cogsByDay.get(d._id) ?? 0);
        return {
          date: d._id,
          orders: d.orders,
          revenue: round2(d.revenue),
          cogs: dayCogs,
          profit: round2(d.revenue - dayCogs),
        };
      },
    );

    const byItem: SalesReportItemBreakdown[] = (result?.itemStats ?? []).map(
      (item) => ({
        menuItemId: item._id,
        name: item.name,
        qtySold: item.qtySold,
        revenue: round2(item.revenue),
        cogs: round2(item.cogs),
        profit: round2(item.revenue - item.cogs),
        marginPct:
          item.revenue > 0
            ? round2(((item.revenue - item.cogs) / item.revenue) * 100)
            : null,
        hasIncompleteCostData: item.missingCostQty > 0,
      }),
    );

    return {
      currency: restaurant.currency,
      range: { from: from ?? null, to: to ?? null },
      totals: {
        orders,
        revenue: round2(revenue),
        deliveryFeeTotal: round2(totals?.deliveryFeeTotal ?? 0),
        serviceFeeTotal: round2(totals?.serviceFeeTotal ?? 0),
        discountTotal: round2(totals?.discountTotal ?? 0),
        platformFeeTotal: round2(totals?.platformFeeTotal ?? 0),
        netEarned: round2(totals?.netEarned ?? 0),
        totalCollected: round2(totals?.totalCollected ?? 0),
        cogs,
        grossProfit,
        grossMarginPct:
          revenue > 0 ? round2((grossProfit / revenue) * 100) : null,
        avgOrderValue: orders > 0 ? round2(revenue / orders) : 0,
      },
      itemsMissingCostPrice: [
        ...new Set(
          byItem.filter((i) => i.hasIncompleteCostData).map((i) => i.name),
        ),
      ],
      byItem,
      byDay,
    };
  }

  /** Order-level detail backing the sales report's CSV export — one row per DELIVERED order in
   * range, same date-range/ownership rules as getSalesReport, kept as a separate simpler query
   * (a plain `.find()`, not an aggregation) since a CSV needs the individual order documents
   * anyway rather than pre-aggregated summaries. */
  async getSalesReportOrders(
    requester: AccessTokenPayload,
    restaurantId: string,
    from?: Date,
    to?: Date,
  ): Promise<OrderDocument[]> {
    const restaurant =
      await this.restaurantsService.findByIdOrThrow(restaurantId);
    this.restaurantsService.assertOwnerOrAdmin(restaurant, requester);

    return this.orderModel
      .find(this.deliveredOrdersMatch(restaurant._id.toString(), from, to))
      .sort({ deliveredAt: 1 })
      .exec();
  }

  /** Shared `$match` stage for both sales-report queries above — .toString(), never the raw
   * ObjectId (Mongoose 9 quirk, ref fields in this schema store as strings). */
  private deliveredOrdersMatch(
    restaurantId: string,
    from?: Date,
    to?: Date,
  ): Record<string, unknown> {
    const match: Record<string, unknown> = {
      restaurantId,
      status: 'DELIVERED',
    };
    if (from || to) {
      const deliveredAt: Record<string, Date> = {};
      if (from) deliveredAt.$gte = from;
      if (to) deliveredAt.$lte = to;
      match.deliveredAt = deliveredAt;
    }
    return match;
  }

  /** Platform-wide order stats for the admin analytics overview (docs/ROADMAP.md FDP-20) — one
   * aggregation covering both the status breakdown and revenue. Revenue is grouped by currency
   * rather than summed into one number: this platform is genuinely multi-currency (NGN/USD/...
   * restaurants coexist, docs/ARCHITECTURE.md §4), and summing raw totals across currencies
   * would produce a meaningless figure. Counts every non-`pending` payment as revenue
   * (`succeeded` and `refunded` both represent money that was actually collected at some
   * point) rather than only currently-`succeeded` orders. */
  async getAnalyticsSummary(): Promise<{
    totalOrders: number;
    ordersByStatus: Record<OrderStatus, number>;
    revenueByCurrency: Record<string, number>;
  }> {
    const [totalOrders, statusRows, revenueRows] = await Promise.all([
      this.orderModel.countDocuments().exec(),
      this.orderModel
        .aggregate<{ _id: OrderStatus; count: number }>([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.orderModel
        .aggregate<{ _id: string; total: number }>([
          { $match: { paymentStatus: { $in: ['succeeded', 'refunded'] } } },
          { $group: { _id: '$currency', total: { $sum: '$total' } } },
        ])
        .exec(),
    ]);

    const ordersByStatus = Object.fromEntries(
      ORDER_STATUSES.map((status) => [status, 0]),
    ) as Record<OrderStatus, number>;
    for (const row of statusRows) ordersByStatus[row._id] = row.count;

    const revenueByCurrency: Record<string, number> = {};
    for (const row of revenueRows) revenueByCurrency[row._id] = row.total;

    return { totalOrders, ordersByStatus, revenueByCurrency };
  }
}
