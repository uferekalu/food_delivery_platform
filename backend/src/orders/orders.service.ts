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
import { StoresService } from '../stores/stores.service';
import { MenuItem, MenuItemDocument } from '../menu/schemas/menu-item.schema';
import { Product, ProductDocument } from '../stores/schemas/product.schema';
import { Rider, RiderDocument } from '../riders/schemas/rider.schema';
import { PromoCodesService } from '../promo-codes/promo-codes.service';
import { PaymentProviderResolver } from '../payments/provider-resolver';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { generateOrderNumber } from '../common/utils/order-number';
import { formatMoney } from '../common/utils/currency';
import { PLATFORM_COMMISSION_RATE } from '../common/constants/platform-fee';
import { Order, OrderDocument } from './schemas/order.schema';
import {
  PayoutClawback,
  PayoutClawbackDocument,
} from '../payouts/schemas/payout-clawback.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { TaxResolver, TAX_RATE_TABLE } from './tax-resolver';
import { canOwnerTransition, canRiderTransition } from './order-state-machine';
import {
  ACTIVE_DELIVERY_STATUSES,
  ORDER_STATUSES,
} from './schemas/order-status';
import type { OrderStatus, OrderPaymentStatus } from './schemas/order-status';
import type { PaymentProvider } from '../payments/payment-provider';
import type { ListOrderTransactionsQueryDto } from './dto/list-order-transactions-query.dto';
import type { PaginatedResult } from '../restaurants/restaurants.service';

// Nearest-rider dispatch (docs/ROADMAP.md FDP-98) only looks this far from the seller — beyond
// this, dispatching would hand a rider a trip not actually worth taking, and the order is better
// left for the manual queue (`findUnassignedForRiders`) instead. Also the radius
// `getAvailableRidersForOwner` (docs/ROADMAP.md FDP-133) shows a seller, so "nearby" means the
// same thing whether a human or the auto-dispatch sweep is picking.
const NEARBY_RIDER_DISPATCH_RADIUS_KM = 15;
// How many nearest-by-distance candidates to pull before filtering out already-busy riders —
// generous enough that a handful of busy riders near the front doesn't exhaust the list.
const NEARBY_RIDER_CANDIDATE_LIMIT = 15;
// A seller picking manually gets a few more options than the single best guess auto-dispatch
// needs — still capped, since showing 100 riders on a picker isn't more useful than showing 20.
const NEARBY_RIDER_PICKER_LIMIT = 20;

// How long a seller gets to manually assign a rider themselves (docs/ROADMAP.md FDP-133) before
// RiderDispatchSchedulerService's sweep falls back to the same automatic nearest-rider dispatch
// that used to fire instantly. Long enough for a human to notice and act, short enough that an
// order never stalls for real if they don't.
export const RIDER_ASSIGNMENT_GRACE_PERIOD_MS = 3 * 60 * 1000;

// Customer-facing copy for each status a notification is sent for — every entry here also
// gets an in-app row + email; only OUT_FOR_DELIVERY/DELIVERED additionally go out over SMS
// (docs/ROADMAP.md FDP-19), since those are the two moments customers most want to know about
// even without opening the app. Statuses with no entry (none currently) simply don't notify.
const ORDER_STATUS_MESSAGES: Partial<
  Record<OrderStatus, { title: string; body: (order: OrderDocument) => string }>
> = {
  PLACED: {
    title: 'Order confirmed',
    body: (order) => `Your order ${order.orderNumber} has been confirmed.`,
  },
  ACCEPTED_BY_RESTAURANT: {
    title: 'Order accepted',
    body: (order) =>
      `Order ${order.orderNumber} has been accepted and will be prepared shortly.`,
  },
  PREPARING: {
    title: 'Order being prepared',
    body: (order) => `Your order ${order.orderNumber} is being prepared.`,
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

// Statuses a seller (restaurant or store owner, docs/ROADMAP.md FDP-56) still needs to see in
// their live order queue. Excludes PENDING_PAYMENT (not actionable until FDP-14's webhook moves
// it to PLACED) and terminal statuses. Used to stop at READY_FOR_PICKUP — the order vanished
// from the seller's view the instant a rider was attached, which is exactly the "the store has
// no control and no visibility once it hits the rider stage" gap docs/ROADMAP.md FDP-133 fixes:
// the three rider-in-progress statuses now stay visible too, so the seller can see who's
// assigned, contact them, and reassign if needed, all the way through to pickup being underway.
const ACTIVE_SELLER_STATUSES: OrderStatus[] = [
  'PLACED',
  'ACCEPTED_BY_RESTAURANT',
  'PREPARING',
  'READY_FOR_PICKUP',
  'ASSIGNED_TO_RIDER',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
];

// deliveryFee is real distance-based DeliveryZone pricing as of FDP-15 (see
// DeliveryZonesService.calculateFee) — this flat rate only applies to serviceFee, which is a
// platform fee unrelated to distance. Exported so getFeeSchedule (docs/ROADMAP.md FDP-129) can
// surface it to the admin/vendor "how fees work" reference blurb without a second copy of the
// number.
export const SERVICE_FEE_RATE = 0.05;

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

// Seller-driven rider assignment (docs/ROADMAP.md FDP-133) — the shape `attachRiderContact`
// enriches a seller's order-queue view with, and `getAvailableRidersForOwner` uses for each
// nearby candidate. A name/phone pair exposed outside the rider's own account for the first
// time in this codebase — deliberately narrow (just enough for the seller to identify and call
// them), not the full Rider/User document.
export interface OrderRiderContact {
  riderId: string;
  name: string;
  phone: string | null;
  vehicleType: string;
  rating: number;
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
    taxTotal: number;
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

// Admin-wide order transaction ledger (docs/ROADMAP.md FDP-128) — every order across every
// vendor, for auditing, not just one seller's own delivered-only sales report. Vendor is a
// discriminated union (same shape as AdCampaignVendor/PromoCodeScope) so the admin UI can render
// a name + type-specific badge without a raw restaurantId/storeId meaning nothing at a glance.
export interface OrderTransactionVendor {
  type: 'restaurant' | 'store';
  id: string;
  name: string;
}

export interface OrderTransactionItem {
  name: string;
  qty: number;
  price: number;
}

// Categorical per-order fee breakdown (docs/ROADMAP.md FDP-129) — direct user feedback that the
// admin ledger and vendor sales report needed to show exactly what was charged and why, not just
// a bare total. `*RatePct` fields are the EFFECTIVE rate actually applied to this specific order
// (derived from its own stored amounts: e.g. `platformFeeAmount / subtotal * 100`), not the
// platform's current global constant — this matters because platformFeeAmount/serviceFee/tax are
// all snapshotted onto the order at creation time and never rewritten, so an order placed before
// a later rate change must keep showing the rate that was actually applied to IT, not today's
// rate. `deliveryFeeSharePct` is different in kind from the other three: deliveryFee is real
// distance/zone-based pricing (DeliveryZonesService.calculateFee), not a percentage of anything —
// this is its share of that order's total, shown for proportion/context only, never labelled as a
// "delivery fee rate".
export interface OrderTransaction {
  _id: string;
  orderNumber: string;
  vendor: OrderTransactionVendor;
  items: OrderTransactionItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
  platformFeeAmount: number;
  /** What the vendor is actually paid for this order (subtotal minus platformFeeAmount) — same
   * field Order.restaurantPayoutAmount already tracks, surfaced here under a seller-neutral name
   * for the ledger/report UI. */
  payoutAmount: number;
  platformFeeRatePct: number;
  serviceFeeRatePct: number;
  taxRatePct: number;
  deliveryFeeSharePct: number;
  currency: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  createdAt: Date;
  deliveredAt: Date | null;
}

// Reference figures for the "how fees work" explanation shown before both the admin transactions
// ledger and a vendor's sales-report transactions list (docs/ROADMAP.md FDP-129) — a single
// source so that blurb never drifts from the actual constants used to compute real orders.
export interface FeeSchedule {
  platformCommissionRatePct: number;
  serviceFeeRatePct: number;
  /** Currency code -> VAT/sales-tax percentage, only for currencies TaxResolver has a real rate
   * for (see TAX_RATE_TABLE's own doc comment for why USD/EUR are absent rather than 0). */
  taxRatesByCurrency: Record<string, number>;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItemDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Rider.name) private readonly riderModel: Model<RiderDocument>,
    @InjectModel(PayoutClawback.name)
    private readonly payoutClawbackModel: Model<PayoutClawbackDocument>,
    private readonly cartService: CartService,
    private readonly restaurantsService: RestaurantsService,
    private readonly storesService: StoresService,
    private readonly promoCodesService: PromoCodesService,
    private readonly paymentProviderResolver: PaymentProviderResolver,
    private readonly taxResolver: TaxResolver,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly deliveryZonesService: DeliveryZonesService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
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

  /** Resolves whichever seller owns this order (docs/ROADMAP.md FDP-56) so the notification
   * always reaches the right owner regardless of sellerType. */
  private findOwnerId(order: OrderDocument): Promise<string> {
    if (order.sellerType === 'store') {
      return this.storesService
        .findByIdOrThrow(
          (order.storeId as NonNullable<typeof order.storeId>).toString(),
        )
        .then((store) => store.ownerId.toString());
    }
    return this.restaurantsService
      .findByIdOrThrow(
        (
          order.restaurantId as NonNullable<typeof order.restaurantId>
        ).toString(),
      )
      .then((restaurant) => restaurant.ownerId.toString());
  }

  private notifyNewOrderToOwner(order: OrderDocument): void {
    this.findOwnerId(order)
      .then((ownerId) => {
        const body = `New order ${order.orderNumber} for ${formatMoney(order.total, order.currency)} just came in.`;
        return this.notificationsService.notify({
          userId: ownerId,
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

  /**
   * Public entry point for both seller types (docs/ROADMAP.md FDP-56) — dispatches on the
   * customer's cart, which already carries its own sellerType. `createRestaurantOrder` below is
   * the exact pre-FDP-56 method body, deliberately left untouched (bar this rename) rather than
   * threading a seller-type branch through its middle — that method is the one covered by the
   * FDP-65 payment/security audit, and the safest way to add a second seller type is to leave
   * its control flow alone and put the new one in a fully separate method.
   */
  async createOrder(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<OrderDocument> {
    const cart = await this.cartService.getCart(userId);
    if (cart.sellerType === 'store') {
      return this.createStoreOrder(userId, dto, cart);
    }
    return this.createRestaurantOrder(userId, dto);
  }

  private async createRestaurantOrder(
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
      // Guaranteed set — this is the restaurant-order path, whose cart items always carry a
      // menuItemId (see CartService.addItem).
      const current = menuItemSnapshots.find(
        (a) => a._id.toString() === item.menuItemId!.toString(),
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
      'restaurant',
      restaurant,
      dto.deliveryAddress,
      subtotal,
    );
    const serviceFee = round2(subtotal * SERVICE_FEE_RATE);
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
        { sellerType: 'restaurant', sellerId: cart.restaurantId },
        subtotal,
      );
      if (!validation.valid) throw new BadRequestException(validation.reason);
      discount = round2(validation.discountAmount);
      redeemedPromoCodeId = validation.promoCodeId;
    }

    // Real per-order VAT/sales tax (docs/ROADMAP.md FDP-101), currency-keyed via TaxResolver —
    // computed after discount, on the amount actually charged (subtotal + deliveryFee +
    // serviceFee - discount), not the pre-discount list price.
    const tax = this.taxResolver.calculate(
      subtotal + deliveryFee + serviceFee - discount,
      restaurant.currency,
    );

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
      sellerType: 'restaurant',
      restaurantId: cart.restaurantId,
      storeId: null,
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
            (m) => m._id.toString() === item.menuItemId!.toString(),
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

    if (redeemedPromoCodeId) {
      // `order` (with the discount already applied) is committed above regardless of this
      // result — see `PromoCodesService.redeem`'s doc comment for why a `false` here (a
      // concurrent order raced this one to the code's last redemption) isn't unwound.
      const redeemed = await this.promoCodesService.redeem(redeemedPromoCodeId);
      if (!redeemed) {
        this.logger.warn(
          `Promo code ${redeemedPromoCodeId} was already at its usage limit when order ${order._id.toString()} tried to redeem it (concurrent redemption race) — the order's discount was still applied.`,
        );
      }
    }
    await this.cartService.clearCart(userId);

    return order;
  }

  /**
   * Store-catalog counterpart of `createRestaurantOrder` (docs/ROADMAP.md FDP-56, brought to
   * full parity with restaurant orders in FDP-90). Mirrors its structure closely, with the one
   * remaining difference a store actually has: Product availability (including stock, which a
   * cooked-to-order restaurant dish never needs) instead of MenuItem.isAvailable. Delivery-zone
   * pricing and promo codes now both work identically to a restaurant order — `cart` is passed
   * in from the `createOrder` dispatcher, which already fetched it to decide which method to
   * call — refetching here would be redundant.
   */
  private async createStoreOrder(
    userId: string,
    dto: CreateOrderDto,
    cart: Awaited<ReturnType<CartService['getCart']>>,
  ): Promise<OrderDocument> {
    if (!cart.storeId || cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    const store = await this.storesService.findByIdOrThrow(cart.storeId);
    if (!store.isApproved || !store.isOpen) {
      throw new BadRequestException(
        'This store is no longer accepting orders — please review your cart',
      );
    }

    // Same "price snapshotted at add-to-cart time, availability re-checked fresh at checkout"
    // split as createRestaurantOrder — plus a stock check, since a tracked Product (unlike a
    // MenuItem) can run out between add-to-cart and checkout.
    const productSnapshots = await this.productModel
      .find(
        { _id: { $in: cart.items.map((i) => i.productId) } },
        { isAvailable: 1, costPrice: 1, stockQuantity: 1 },
      )
      .exec();
    const unavailable = cart.items.find((item) => {
      const current = productSnapshots.find(
        (p) => p._id.toString() === item.productId?.toString(),
      );
      return (
        !current ||
        !current.isAvailable ||
        (current.stockQuantity != null && current.stockQuantity < item.qty)
      );
    });
    if (unavailable) {
      throw new BadRequestException(
        `"${unavailable.name}" is no longer available in the quantity requested — please review your cart`,
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
      'store',
      store,
      dto.deliveryAddress,
      subtotal,
    );
    const serviceFee = round2(subtotal * SERVICE_FEE_RATE);
    // Same commission model as a restaurant order — see createRestaurantOrder's comment.
    // restaurantPayoutAmount's field name is legacy (kept for the reason on Order.schema.ts);
    // it means "what the seller is owed" for either seller type.
    const platformFeeAmount = round2(subtotal * PLATFORM_COMMISSION_RATE);
    const restaurantPayoutAmount = round2(subtotal - platformFeeAmount);

    let discount = 0;
    let redeemedPromoCodeId: string | null = null;
    if (dto.promoCode) {
      const validation = await this.promoCodesService.validate(
        dto.promoCode,
        { sellerType: 'store', sellerId: cart.storeId },
        subtotal,
      );
      if (!validation.valid) throw new BadRequestException(validation.reason);
      discount = round2(validation.discountAmount);
      redeemedPromoCodeId = validation.promoCodeId;
    }

    // Real per-order VAT/sales tax (docs/ROADMAP.md FDP-101) — see createRestaurantOrder's
    // comment for the taxable-base/ordering reasoning.
    const tax = this.taxResolver.calculate(
      subtotal + deliveryFee + serviceFee - discount,
      store.currency,
    );

    const total = Math.max(
      0,
      round2(subtotal + deliveryFee + serviceFee + tax - discount),
    );
    const paymentProvider = this.paymentProviderResolver.resolveDefault(
      store.currency,
    );

    const order = await this.orderModel.create({
      orderNumber: generateOrderNumber(),
      customerId: userId,
      sellerType: 'store',
      restaurantId: null,
      storeId: cart.storeId,
      items: cart.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        costPrice:
          productSnapshots.find(
            (p) => p._id.toString() === item.productId?.toString(),
          )?.costPrice ?? null,
        imageUrl: item.imageUrl,
        qty: item.qty,
        selectedModifiers: [],
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
      currency: store.currency,
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

    if (redeemedPromoCodeId) {
      // `order` (with the discount already applied) is committed above regardless of this
      // result — see `PromoCodesService.redeem`'s doc comment for why a `false` here (a
      // concurrent order raced this one to the code's last redemption) isn't unwound.
      const redeemed = await this.promoCodesService.redeem(redeemedPromoCodeId);
      if (!redeemed) {
        this.logger.warn(
          `Promo code ${redeemedPromoCodeId} was already at its usage limit when order ${order._id.toString()} tried to redeem it (concurrent redemption race) — the order's discount was still applied.`,
        );
      }
    }
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

  /** "Buy again" (docs/ROADMAP.md FDP-97) — ownership-checked via the existing findOne, then
   * handed straight to CartService, which owns all the "is this still orderable" validation
   * (item availability, seller open/approved, modifier re-resolution). */
  async reorder(userId: string, orderId: string, replace = false) {
    const order = await this.findOne(userId, orderId);
    return this.cartService.reorderFromOrder(userId, order, replace);
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
   * oldest first (a queue is processed in the order it was received, not newest-first). Each
   * order is enriched with its assigned rider's contact info, if any (docs/ROADMAP.md FDP-133) —
   * see `attachRiderContact`. */
  async findForRestaurant(
    requester: AccessTokenPayload,
    restaurantId: string,
  ): Promise<Array<Record<string, unknown> & { rider: OrderRiderContact | null }>> {
    const restaurant =
      await this.restaurantsService.findByIdOrThrow(restaurantId);
    this.restaurantsService.assertOwnerOrAdmin(restaurant, requester);

    const orders = await this.orderModel
      .find({ restaurantId, status: { $in: ACTIVE_SELLER_STATUSES } })
      .sort({ createdAt: 1 })
      .exec();
    return this.attachRiderContact(orders);
  }

  /** Store-catalog counterpart of `findForRestaurant` (docs/ROADMAP.md FDP-56). */
  async findForStore(
    requester: AccessTokenPayload,
    storeId: string,
  ): Promise<Array<Record<string, unknown> & { rider: OrderRiderContact | null }>> {
    const store = await this.storesService.findByIdOrThrow(storeId);
    this.storesService.assertOwnerOrAdmin(store, requester);

    const orders = await this.orderModel
      .find({ storeId, status: { $in: ACTIVE_SELLER_STATUSES } })
      .sort({ createdAt: 1 })
      .exec();
    return this.attachRiderContact(orders);
  }

  /** Enriches each order with the assigned rider's contact info (docs/ROADMAP.md FDP-133) — so
   * the seller's queue can show who's coming and offer a "call rider" link once one's attached,
   * instead of just a raw `riderId`. `rider` is `null` for every order with no rider yet. Returns
   * plain objects (each order's own fields, plus `rider`), not Mongoose documents — nothing
   * downstream needs to `.save()` these, they're a read-only queue view. */
  private async attachRiderContact(
    orders: OrderDocument[],
  ): Promise<Array<Record<string, unknown> & { rider: OrderRiderContact | null }>> {
    const riderIds = Array.from(
      new Set(
        orders
          .map((o) => o.riderId?.toString())
          .filter((id): id is string => !!id),
      ),
    );
    if (riderIds.length === 0) {
      return orders.map((o) => ({ ...o.toObject(), rider: null }));
    }

    const [riderProfiles, users] = await Promise.all([
      this.riderModel.find({ userId: { $in: riderIds } }).exec(),
      this.usersService.findByIds(riderIds),
    ]);
    const profileByUserId = new Map(
      riderProfiles.map((r) => [r.userId.toString(), r]),
    );
    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    return orders.map((o) => {
      const riderId = o.riderId?.toString();
      if (!riderId) return { ...o.toObject(), rider: null };
      const profile = profileByUserId.get(riderId);
      const user = userById.get(riderId);
      const rider: OrderRiderContact | null = user
        ? {
            riderId,
            name: user.name,
            phone: user.phone ?? null,
            vehicleType: profile?.vehicleType ?? 'motorcycle',
            rating: profile?.rating ?? 0,
          }
        : null;
      return { ...o.toObject(), rider };
    });
  }

  /**
   * The seller's accept/reject/prepare/ready actions (docs/ROADMAP.md FDP-13) — see
   * order-state-machine.ts for exactly which transitions this allows and why
   * PENDING_PAYMENT→PLACED and every rider-stage transition are deliberately excluded. Public
   * entry point for both seller types (docs/ROADMAP.md FDP-56): a single `PATCH /orders/:id/
   * status` route backs both, since store ownership reuses the `restaurant_owner` role (the
   * route's `@Roles` guard already covers both) — this dispatches on the order itself once
   * fetched, the same "peek, then delegate" shape as `createOrder`.
   */
  async updateStatusByOwner(
    requester: AccessTokenPayload,
    orderId: string,
    targetStatus: OrderStatus,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');

    if (order.sellerType === 'store') {
      const store = await this.storesService.findByIdOrThrow(
        (order.storeId as NonNullable<typeof order.storeId>).toString(),
      );
      this.storesService.assertOwnerOrAdmin(store, requester);
    } else {
      const restaurant = await this.restaurantsService.findByIdOrThrow(
        (
          order.restaurantId as NonNullable<typeof order.restaurantId>
        ).toString(),
      );
      this.restaurantsService.assertOwnerOrAdmin(restaurant, requester);
    }

    return this.applyOwnerTransition(order, targetStatus, requester);
  }

  /** Shared tail of `updateStatusByOwner`/`updateStatusByStoreOwner` — the state-machine check,
   * the transition itself, and its side effects (realtime emit + customer notification) are
   * identical for either seller type; only how ownership was verified differs, which each
   * caller above already did before reaching here. */
  private async applyOwnerTransition(
    order: OrderDocument,
    targetStatus: OrderStatus,
    requester: AccessTokenPayload,
  ): Promise<OrderDocument> {
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
    // docs/ROADMAP.md FDP-133 — direct feedback that the seller had no say in who a ready order
    // got dispatched to, since this used to auto-dispatch to the nearest rider immediately, right
    // here. Now it just timestamps the moment so the seller gets a real window
    // (RIDER_ASSIGNMENT_GRACE_PERIOD_MS) to pick a rider themselves via `assignRiderByOwner`
    // before `RiderDispatchSchedulerService`'s sweep falls back to the same automatic dispatch —
    // see `autoDispatchStaleReadyOrders` below.
    if (targetStatus === 'READY_FOR_PICKUP') {
      order.readyForPickupAt = new Date();
    }
    await order.save();

    this.realtimeGateway.emitOrderStatusChanged(order);
    this.notifyOrderStatus(order);
    return order;
  }

  /**
   * Algorithmic nearest-rider dispatch (docs/ROADMAP.md FDP-98) — replaces pure "any online
   * rider can grab any ready order" with an automatic first attempt at the closest eligible one.
   * As of FDP-133 this no longer fires the instant an order goes READY_FOR_PICKUP — it's now the
   * fallback `autoDispatchStaleReadyOrders` reaches for once the seller's grace period lapses
   * without them picking someone via `assignRiderByOwner`. Swallows its own errors (a missing
   * seller location, nobody nearby, a transient DB error) and resolves `null` rather than
   * rejecting. `findUnassignedForRiders`'s manual queue stays exactly as it was — the fallback
   * for whenever this finds nobody, not replaced by it.
   */
  private async dispatchToNearestRider(
    order: OrderDocument,
  ): Promise<OrderDocument | null> {
    try {
      const candidates = await this.findNearbyRiderCandidates(
        order,
        NEARBY_RIDER_CANDIDATE_LIMIT,
      );
      if (candidates.length === 0) return null;
      return await this.assignToRider(
        candidates[0].userId,
        order._id.toString(),
      );
    } catch (err) {
      this.logger.error(
        `Nearest-rider dispatch failed for order ${order._id.toString()}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Cron-driven fallback (docs/ROADMAP.md FDP-133; triggered by `RiderDispatchSchedulerService`)
   * — picks up every order still stuck at READY_FOR_PICKUP with no rider once
   * `RIDER_ASSIGNMENT_GRACE_PERIOD_MS` has passed since `readyForPickupAt`, and dispatches it the
   * same way the old instant auto-dispatch used to, so an order the seller doesn't act on never
   * stalls forever. Per-order failures are already caught individually inside
   * `dispatchToNearestRider`, so one bad order can't stop the rest of the sweep.
   */
  async autoDispatchStaleReadyOrders(): Promise<{
    dispatched: number;
    checked: number;
  }> {
    const cutoff = new Date(Date.now() - RIDER_ASSIGNMENT_GRACE_PERIOD_MS);
    const staleOrders = await this.orderModel
      .find({
        status: 'READY_FOR_PICKUP',
        riderId: null,
        readyForPickupAt: { $ne: null, $lte: cutoff },
      })
      .exec();

    let dispatched = 0;
    for (const order of staleOrders) {
      const result = await this.dispatchToNearestRider(order);
      if (result) dispatched += 1;
    }
    return { dispatched, checked: staleOrders.length };
  }

  /**
   * Shared candidate query behind both the automatic dispatch above and the seller-facing picker
   * (`getAvailableRidersForOwner`) — `$geoNear` over `Rider.currentLocation` (docs/ARCHITECTURE.md
   * §22's pattern, reused verbatim) rather than an in-memory haversine sort. A rider who's never
   * shared their location (`currentLocation: null`) is silently excluded, not errored, since
   * `$geoNear` can't match a document with no valid geo field for its 2dsphere index. Returns an
   * empty array (never throws) whenever there's simply nobody nearby — a missing seller location,
   * nobody online nearby, or every nearby rider already mid-delivery are all unremarkable,
   * expected outcomes.
   */
  private async findNearbyRiderCandidates(
    order: OrderDocument,
    limit: number,
  ): Promise<
    Array<{
      userId: string;
      distanceMeters: number;
      vehicleType: string;
      rating: number;
      reviewCount: number;
    }>
  > {
    const sellerLocation = await this.getSellerLocation(order);
    if (!sellerLocation) return [];

    const candidates = await this.riderModel
      .aggregate<{
        userId: string;
        distanceMeters: number;
        vehicleType: string;
        rating: number;
        reviewCount: number;
      }>([
        {
          $geoNear: {
            near: sellerLocation,
            distanceField: 'distanceMeters',
            maxDistance: NEARBY_RIDER_DISPATCH_RADIUS_KM * 1000,
            spherical: true,
            query: { isOnline: true, isVerified: true },
          },
        },
        { $limit: limit },
        {
          $project: {
            userId: { $toString: '$userId' },
            distanceMeters: 1,
            vehicleType: 1,
            rating: 1,
            reviewCount: 1,
          },
        },
      ])
      .exec();
    if (candidates.length === 0) return [];

    // $geoNear already returns nearest-first — a rider already mid-delivery is excluded in favor
    // of the next-nearest one, rather than being handed a second concurrent order.
    const candidateIds = candidates.map((c) => c.userId);
    const busyRiderIds = await this.orderModel
      .distinct('riderId', {
        riderId: { $in: candidateIds },
        status: { $in: ACTIVE_DELIVERY_STATUSES },
      })
      .exec();
    const busy = new Set(busyRiderIds.map((id: unknown) => String(id)));

    return candidates.filter((c) => !busy.has(c.userId));
  }

  /** The point dispatch measures distance from — the seller's own address, not the customer's
   * delivery address, since the rider has to reach the restaurant/store first. Reuses whichever
   * `address.location` FDP-96 already computed and kept in sync, rather than recomputing it. */
  private async getSellerLocation(
    order: OrderDocument,
  ): Promise<{ type: 'Point'; coordinates: [number, number] } | null> {
    if (order.sellerType === 'store') {
      const store = await this.storesService.findByIdOrThrow(
        (order.storeId as NonNullable<typeof order.storeId>).toString(),
      );
      return store.address.location ?? null;
    }
    const restaurant = await this.restaurantsService.findByIdOrThrow(
      (order.restaurantId as NonNullable<typeof order.restaurantId>).toString(),
    );
    return restaurant.address.location ?? null;
  }

  /** Small helper alongside `getSellerLocation`/`findOwnerId` — same per-call restaurant/store
   * fetch, just resolving the display name instead (docs/ROADMAP.md FDP-133, rider-assignment
   * notification copy). */
  private async getSellerName(order: OrderDocument): Promise<string> {
    if (order.sellerType === 'store') {
      const store = await this.storesService.findByIdOrThrow(
        (order.storeId as NonNullable<typeof order.storeId>).toString(),
      );
      return store.name;
    }
    const restaurant = await this.restaurantsService.findByIdOrThrow(
      (order.restaurantId as NonNullable<typeof order.restaurantId>).toString(),
    );
    return restaurant.name;
  }

  /** Ownership check shared by every seller-initiated order action (docs/ROADMAP.md FDP-133) —
   * `updateStatusByOwner` used to inline this itself; factored out so `getAvailableRidersForOwner`
   * and `assignRiderByOwner` below don't each need their own copy. */
  private async assertOwnerAccessToOrder(
    order: OrderDocument,
    requester: AccessTokenPayload,
  ): Promise<void> {
    if (order.sellerType === 'store') {
      const store = await this.storesService.findByIdOrThrow(
        (order.storeId as NonNullable<typeof order.storeId>).toString(),
      );
      this.storesService.assertOwnerOrAdmin(store, requester);
    } else {
      const restaurant = await this.restaurantsService.findByIdOrThrow(
        (
          order.restaurantId as NonNullable<typeof order.restaurantId>
        ).toString(),
      );
      this.restaurantsService.assertOwnerOrAdmin(restaurant, requester);
    }
  }

  /** The seller's own "who can I assign this to" picker (docs/ROADMAP.md FDP-133) — the same
   * nearby/available candidate pool `dispatchToNearestRider` uses, but the full list rather than
   * just the top pick, enriched with the rider's name/phone so the seller can actually call them.
   * Allowed while READY_FOR_PICKUP (the normal case) or still ASSIGNED_TO_RIDER (reassigning
   * before pickup — e.g. the assigned rider isn't responding); anything past that the rider
   * already has the order in hand and reassigning makes no sense. */
  async getAvailableRidersForOwner(
    requester: AccessTokenPayload,
    orderId: string,
  ): Promise<
    Array<{
      riderId: string;
      name: string;
      phone: string | null;
      vehicleType: string;
      rating: number;
      reviewCount: number;
      distanceKm: number;
    }>
  > {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');
    await this.assertOwnerAccessToOrder(order, requester);

    if (
      order.status !== 'READY_FOR_PICKUP' &&
      order.status !== 'ASSIGNED_TO_RIDER'
    ) {
      throw new BadRequestException(
        'This order is not at a stage where a rider can be assigned',
      );
    }

    const candidates = await this.findNearbyRiderCandidates(
      order,
      NEARBY_RIDER_PICKER_LIMIT,
    );
    const currentRiderId = order.riderId?.toString() ?? null;
    const eligible = candidates.filter((c) => c.userId !== currentRiderId);
    if (eligible.length === 0) return [];

    const users = await this.usersService.findByIds(
      eligible.map((c) => c.userId),
    );
    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    return eligible.map((c) => {
      const user = userById.get(c.userId);
      return {
        riderId: c.userId,
        name: user?.name ?? 'Rider',
        phone: user?.phone ?? null,
        vehicleType: c.vehicleType,
        rating: c.rating,
        reviewCount: c.reviewCount,
        distanceKm: round2(c.distanceMeters / 1000),
      };
    });
  }

  /**
   * The seller directly choosing who delivers their order (docs/ROADMAP.md FDP-133) — replaces
   * "leave it for a rider to self-claim or wait for auto-dispatch" with an explicit choice.
   * Covers two cases: assigning a still-unassigned READY_FOR_PICKUP order (reuses the exact same
   * atomic `assignToRider` the self-claim/auto-dispatch paths use, so the race-safety is
   * identical), and reassigning an already-ASSIGNED_TO_RIDER order to a different rider (e.g. the
   * first one isn't responding) — the previous rider is notified they've been unassigned, the new
   * one notified they've been assigned, same as a fresh assignment.
   */
  async assignRiderByOwner(
    requester: AccessTokenPayload,
    orderId: string,
    riderUserId: string,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');
    await this.assertOwnerAccessToOrder(order, requester);

    const rider = await this.riderModel
      .findOne({ userId: riderUserId })
      .exec();
    if (!rider) throw new NotFoundException('Rider not found');
    if (!rider.isVerified) {
      throw new BadRequestException(
        'This rider is not verified yet and cannot be assigned an order',
      );
    }

    if (order.status === 'READY_FOR_PICKUP' && !order.riderId) {
      return this.assignToRider(riderUserId, orderId);
    }

    if (order.status === 'ASSIGNED_TO_RIDER' && order.riderId) {
      const previousRiderId = order.riderId.toString();
      if (previousRiderId === riderUserId) {
        throw new BadRequestException(
          'This rider is already assigned to this order',
        );
      }
      const updated = await this.orderModel
        .findOneAndUpdate(
          { _id: orderId, status: 'ASSIGNED_TO_RIDER' },
          {
            $set: { riderId: riderUserId },
            $push: {
              statusHistory: {
                status: 'ASSIGNED_TO_RIDER',
                at: new Date(),
                by: requester.sub,
              },
            },
          },
          { returnDocument: 'after' },
        )
        .exec();
      if (!updated) {
        throw new BadRequestException(
          'This order has moved on and can no longer be reassigned',
        );
      }

      this.realtimeGateway.emitOrderStatusChanged(updated);
      this.notifyRiderUnassigned(previousRiderId, updated);
      this.notifyRiderAssigned(riderUserId, updated);
      this.notifyOwnerOfRiderAssignment(updated, riderUserId);
      return updated;
    }

    throw new BadRequestException(
      'This order is not at a stage where a rider can be assigned',
    );
  }

  /** Fire-and-forget rider-facing notification for a new assignment (docs/ROADMAP.md FDP-133) —
   * previously a rider only learned about an assignment by refetching after the realtime
   * `order:statusChanged` event; this is the first explicit "you've been given a delivery" push.
   * Skipped for a rider's own self-claim (see `assignToRider`'s `notifyRider` option) — telling
   * someone about the thing they just clicked themselves adds nothing. */
  private notifyRiderAssigned(riderUserId: string, order: OrderDocument): void {
    this.getSellerName(order)
      .then((sellerName) => {
        const body = `You've been assigned to deliver order ${order.orderNumber} from ${sellerName}. Head over to pick it up.`;
        return this.notificationsService.notify({
          userId: riderUserId,
          type: 'rider_assigned',
          title: 'New delivery assigned',
          body,
          metadata: { orderId: order._id.toString() },
          email: {
            subject: `New delivery — ${order.orderNumber}`,
            html: `<p>${body}</p>`,
          },
          sms: body,
        });
      })
      .catch((err: Error) =>
        this.logger.error(
          `Rider-assigned notification failed for order ${order._id.toString()}: ${err.message}`,
        ),
      );
  }

  /** Counterpart of `notifyRiderAssigned` for a seller-initiated reassignment (docs/ROADMAP.md
   * FDP-133) — lets the previous rider know they're no longer on the hook for this delivery. */
  private notifyRiderUnassigned(
    riderUserId: string,
    order: OrderDocument,
  ): void {
    const body = `You've been unassigned from order ${order.orderNumber} — it's been reassigned to another rider.`;
    this.notificationsService
      .notify({
        userId: riderUserId,
        type: 'rider_unassigned',
        title: 'Delivery reassigned',
        body,
        metadata: { orderId: order._id.toString() },
      })
      .catch((err: Error) =>
        this.logger.error(
          `Rider-unassigned notification failed for order ${order._id.toString()}: ${err.message}`,
        ),
      );
  }

  /** Fire-and-forget seller-facing notification once a rider is attached to their order — by
   * self-claim, auto-dispatch, or the seller's own `assignRiderByOwner` pick (docs/ROADMAP.md
   * FDP-133) — so the seller always knows who's coming and can call them (see
   * `getAvailableRidersForOwner`'s phone number) without having to keep refreshing the dashboard. */
  private notifyOwnerOfRiderAssignment(
    order: OrderDocument,
    riderUserId: string,
  ): void {
    Promise.all([
      this.findOwnerId(order),
      this.usersService.findById(riderUserId),
    ])
      .then(([ownerId, rider]) => {
        const riderName = rider?.name ?? 'A rider';
        const body = `${riderName} has been assigned to deliver order ${order.orderNumber}.`;
        return this.notificationsService.notify({
          userId: ownerId,
          type: 'order_rider_assigned',
          title: 'Rider assigned to your order',
          body,
          metadata: { orderId: order._id.toString(), riderId: riderUserId },
        });
      })
      .catch((err: Error) =>
        this.logger.error(
          `Owner rider-assignment notification failed for order ${order._id.toString()}: ${err.message}`,
        ),
      );
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
   * silently overwriting the winner's claim. Also the shared core `dispatchToNearestRider` (auto)
   * and `assignRiderByOwner`'s first-assignment case (seller-picked) call into, since all three
   * are "attach this specific rider to this still-unassigned order" — same atomicity needed
   * either way. `notifyRider` defaults to true; the rider's own self-claim (`RidersController`)
   * passes `false`, since telling someone about the thing they just clicked themselves adds
   * nothing. The seller is notified who was assigned regardless of which of the three triggered
   * this (docs/ROADMAP.md FDP-133) — see `notifyOwnerOfRiderAssignment`.
   */
  async assignToRider(
    riderUserId: string,
    orderId: string,
    options?: { notifyRider?: boolean },
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
    if (options?.notifyRider !== false) {
      this.notifyRiderAssigned(riderUserId, order);
    }
    this.notifyOwnerOfRiderAssignment(order, riderUserId);
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
   * field.
   *
   * `settledViaInstantSplit` (docs/ROADMAP.md FDP-92) mirrors `paymentProvider`'s own "reflects
   * the latest attempt" semantics — overwritten on every call, not accumulated, since only the
   * most recent attempt's reference is the one that can actually get paid. See
   * `Order.settledViaInstantSplit`'s doc comment for why this exists at all. */
  async setPaymentRef(
    order: OrderDocument,
    provider: PaymentProvider,
    paymentRef: string,
    settledViaInstantSplit = false,
  ): Promise<OrderDocument> {
    order.paymentProvider = provider;
    order.paymentRef = paymentRef;
    order.paymentRefs.push(paymentRef);
    order.settledViaInstantSplit = settledViaInstantSplit;
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
    if (
      order.paymentStatus === 'succeeded' ||
      order.paymentStatus === 'refunded'
    ) {
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
          // Refund-hardening pass (docs/ROADMAP.md FDP-104) — an order whose last refund attempt
          // came back with a genuinely unknown outcome must never be blindly retried; an admin
          // has to resolve it via resolveRefundReconciliation first. Without this, an order this
          // flag reverted back to a REFUNDABLE_STATUSES value would otherwise still pass this
          // filter and could be refunded a second time for real at the provider.
          refundReconciliationRequired: { $ne: true },
        },
        { $set: { status: 'REFUNDED' } },
      )
      .exec(); // default {new: false} — the caller needs the PRE-update doc's status to revert to
  }

  /** Refund flow, part 2/3 (success path) — the provider has actually reversed the charge (or, as
   * of docs/ROADMAP.md FDP-104, a webhook confirmed one already happened outside this app),
   * finalize the claim from `claimForRefund` into a real refunded order. Also the single choke
   * point for the refund-clawback check (§28) — every caller of `finalizeRefund` gets it for
   * free, never something an individual call site has to remember. */
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
    await this.recordVendorClawbackIfNeeded(order);
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
   * Refund flow, ambiguous-outcome path (docs/ROADMAP.md FDP-104) — mirrors
   * `revertFailedRefundClaim` (puts `status` back to its pre-claim value, so the order never
   * falsely shows REFUNDED) but additionally flags it so `claimForRefund` refuses a blind retry.
   * Called when an adapter's `refund()` throws `RefundOutcomeUnknownError` — the reversal may or
   * may not have actually happened, so an admin must check the provider's own dashboard and
   * resolve it via `resolveRefundReconciliation`, the same human-in-the-loop pattern
   * `Payout.reconciliationRequired` already established on the payout side.
   */
  async flagAmbiguousRefund(
    orderId: string,
    previousStatus: OrderStatus,
    reason: string,
  ): Promise<void> {
    const updated = await this.orderModel
      .findOneAndUpdate(
        { _id: orderId, status: 'REFUNDED', paymentStatus: 'succeeded' },
        {
          $set: {
            status: previousStatus,
            refundReconciliationRequired: true,
            refundFailureReason: reason,
          },
        },
      )
      .exec();
    if (!updated) return;
    await this.notifyAdminsOfRefundIssue(
      'refund_reconciliation_needed',
      'Refund needs manual reconciliation',
      `A refund attempt for order ${updated.orderNumber} had an unknown outcome and needs manual review before it's retried. Check the ${updated.paymentProvider} dashboard for a refund around this time. Reason: ${reason}`,
    );
  }

  /**
   * Admin's manual close-out for a `refundReconciliationRequired` order (docs/ROADMAP.md
   * FDP-104) — the same shape as `PayoutExecutionService.resolveReconciliation`. `true` means the
   * admin checked the provider's own dashboard and confirmed the refund DID actually go through
   * (this system just never got the response) — finalize it for real, clawback included. `false`
   * means it confirmed the refund did NOT happen — just clear the flag so a fresh `refundOrder`
   * attempt is possible again.
   */
  async resolveRefundReconciliation(
    orderId: string,
    refundActuallySucceeded: boolean,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');
    if (!order.refundReconciliationRequired) {
      throw new BadRequestException(
        'This order is not flagged for refund reconciliation',
      );
    }

    if (!refundActuallySucceeded) {
      order.refundReconciliationRequired = false;
      order.refundFailureReason = null;
      await order.save();
      return order;
    }

    const claimed = await this.orderModel
      .findOneAndUpdate(
        { _id: orderId, refundReconciliationRequired: true },
        {
          $set: {
            status: 'REFUNDED',
            refundReconciliationRequired: false,
            refundFailureReason: null,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!claimed) throw new NotFoundException('Order not found');
    return this.finalizeRefund(orderId);
  }

  /**
   * Out-of-band dispute detection (docs/ROADMAP.md FDP-104) — a chargeback filed with the
   * customer's bank, surfaced via a provider webhook. Informational only: this codebase never
   * submits dispute evidence, an admin resolves the actual dispute directly in the provider's own
   * dashboard. Doesn't touch `status`/`paymentStatus` — a dispute's outcome isn't decided yet, so
   * nothing about the order's own state should change just because one was opened.
   */
  async flagDispute(orderId: string): Promise<void> {
    const order = await this.orderModel
      .findOneAndUpdate({ _id: orderId }, { $set: { disputeFlagged: true } })
      .exec();
    if (!order) return;
    await this.notifyAdminsOfRefundIssue(
      'order_dispute_flagged',
      'Order disputed by customer',
      `A chargeback/dispute was opened against order ${order.orderNumber} via ${order.paymentProvider}. Respond to it directly in the ${order.paymentProvider} dashboard — this platform does not submit dispute evidence automatically.`,
    );
  }

  /**
   * A PARTIAL out-of-band refund (docs/ROADMAP.md FDP-109) — e.g. a support agent issuing a
   * goodwill refund for less than the full order total directly in a provider's dashboard.
   * Deliberately does NOT touch `status`/`paymentStatus`/trigger a vendor clawback: this
   * codebase's refund model (like `handleRefundWebhook`'s full-refund path, and the documented
   * "partial refunds are out of scope for issuing") assumes a refund is all-or-nothing, so
   * automatically treating a partial one as a full REFUNDED order would overstate the refund and
   * claw back the vendor's *entire* payout for an order they were only partially refunded on.
   * Informational only, same posture as `flagDispute` — an admin decides what to actually do
   * (adjust the vendor payout manually, etc.) outside this app.
   */
  async notifyAdminsOfPartialRefund(
    order: OrderDocument,
    amountRefunded: number,
  ): Promise<void> {
    await this.notifyAdminsOfRefundIssue(
      'order_refunded_externally',
      'Partial refund detected — needs manual review',
      `Order ${order.orderNumber} (total ${order.currency} ${order.total.toFixed(2)}) was partially refunded outside the app via ${order.paymentProvider}: ${order.currency} ${amountRefunded.toFixed(2)} refunded so far. This platform's refund flow assumes all-or-nothing — no automatic clawback or status change was made. Review this order's vendor payout manually if one already went out.`,
    );
  }

  /**
   * Admin visibility (docs/ROADMAP.md FDP-104) — every order that needs a human to look at its
   * refund status: a cancelled order whose payment was never reversed (nothing else in this
   * codebase prompts an admin to do this — cancellation and refunding are two independent manual
   * actions), plus any order stuck on an ambiguous refund outcome awaiting
   * `resolveRefundReconciliation`.
   */
  async findNeedingRefundAttention(): Promise<OrderDocument[]> {
    return this.orderModel
      .find({
        $or: [
          { status: 'CANCELLED', paymentStatus: 'succeeded' },
          { refundReconciliationRequired: true },
        ],
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Refund-vs-payout reconciliation (docs/ROADMAP.md FDP-104, docs/ARCHITECTURE.md §28) — if this
   * order's vendor cut was already sent out by a previous weekly `Payout` (`vendorPayoutId` set),
   * there's no way to pull that money back out of the vendor's bank account automatically, so a
   * `PayoutClawback` is recorded for the exact amount overpaid; `PayoutsService`/
   * `PayoutExecutionService` net it against that vendor's future earnings. If the order was never
   * paid out (the common case — most refunds happen well before the next Monday batch), its
   * REFUNDED status already excludes it from `getUnpaidVendorEarnings` on its own; nothing else
   * to do. Never claws back from a rider — they keep 100% of `deliveryFee` regardless, they
   * already performed the delivery.
   */
  private async recordVendorClawbackIfNeeded(
    order: OrderDocument,
  ): Promise<void> {
    if (!order.vendorPayoutId) return;

    const vendorId =
      order.sellerType === 'store'
        ? order.storeId?.toString()
        : order.restaurantId?.toString();
    if (!vendorId) return;

    await this.payoutClawbackModel.create({
      vendorType: order.sellerType,
      vendorId,
      orderId: order._id.toString(),
      originalPayoutId: order.vendorPayoutId,
      provider: order.paymentProvider,
      currency: order.currency,
      amount: order.restaurantPayoutAmount,
      remainingAmount: order.restaurantPayoutAmount,
      status: 'pending',
    });

    try {
      const seller =
        order.sellerType === 'store'
          ? await this.storesService.findByIdOrThrow(vendorId)
          : await this.restaurantsService.findByIdOrThrow(vendorId);
      const amountLabel = formatMoney(
        order.restaurantPayoutAmount,
        order.currency,
      );
      await this.notificationsService.notify({
        userId: seller.ownerId.toString(),
        type: 'refund_clawback_created',
        title: 'Refund deducted from your next payout',
        body: `Order ${order.orderNumber} was refunded after you'd already been paid for it. ${amountLabel} will be deducted from your upcoming payout(s).`,
        metadata: { orderId: order._id.toString() },
      });
    } catch (error) {
      this.logger.error(
        `Failed to notify vendor about refund clawback for order ${order._id.toString()}`,
        error,
      );
    }

    await this.notifyAdminsOfRefundIssue(
      'refund_clawback_created',
      'Refund deducted from a vendor payout',
      `Order ${order.orderNumber} was refunded after its vendor cut had already been paid out. A clawback of ${formatMoney(order.restaurantPayoutAmount, order.currency)} will be deducted from that vendor's upcoming payout(s).`,
    );
  }

  /** Shared admin fan-out for the refund-hardening pass (docs/ROADMAP.md FDP-104) — same pattern
   * as `PayoutExecutionService.notifyAdmins`, kept local since this module doesn't depend on
   * that one (see orders.module.ts for why). Non-fatal: never lets a notification failure affect
   * the refund flow that triggered it. */
  private async notifyAdminsOfRefundIssue(
    type:
      | 'refund_clawback_created'
      | 'refund_reconciliation_needed'
      | 'order_dispute_flagged'
      | 'order_refunded_externally',
    title: string,
    body: string,
  ): Promise<void> {
    try {
      const admins = await this.usersService.listAll({
        role: 'admin',
        page: 1,
        limit: 50,
      });
      await Promise.all(
        admins.items.map((admin) =>
          this.notificationsService.notify({
            userId: admin._id.toString(),
            type,
            title,
            body,
          }),
        ),
      );
    } catch (error) {
      this.logger.error('Failed to notify admins about a refund issue', error);
    }
  }

  /**
   * Shared ownership-checked seller lookup for earnings/sales-report below (docs/ROADMAP.md
   * FDP-102) — generalizes what was restaurant-only since FDP-51/64 to also cover stores, the
   * same `sellerType`-first-argument generalization FDP-90 already applied to
   * `DeliveryZonesService`/`PromoCodesService`. Returns only the fields those methods actually
   * need (both `RestaurantDocument`/`StoreDocument` satisfy this structurally), so this doesn't
   * need to import either concrete document type.
   */
  private async findSellerOrThrow(
    sellerType: 'restaurant' | 'store',
    sellerId: string,
    requester: AccessTokenPayload,
  ): Promise<{
    _id: { toString(): string };
    name: string;
    currency: string;
    payoutAccounts: { status: string }[];
  }> {
    if (sellerType === 'store') {
      const store = await this.storesService.findByIdOrThrow(sellerId);
      this.storesService.assertOwnerOrAdmin(store, requester);
      return store;
    }
    const restaurant = await this.restaurantsService.findByIdOrThrow(sellerId);
    this.restaurantsService.assertOwnerOrAdmin(restaurant, requester);
    return restaurant;
  }

  /**
   * A seller's earnings — vendor payouts epic, part 1 of 4 (docs/ROADMAP.md FDP-51), generalized
   * to stores in FDP-102 (previously restaurant-only, a real gap left over from FDP-90's own
   * seller-parity pass, which generalized delivery-zones/promo-codes but not this). Only counts
   * DELIVERED orders (money the seller has actually, finally earned — a later refund moves an
   * order to REFUNDED, a separate terminal state, so it naturally drops out here).
   * `payoutSetupComplete` reflects whether *any* provider has an active payout account yet.
   */
  async getEarningsSummary(
    requester: AccessTokenPayload,
    sellerType: 'restaurant' | 'store',
    sellerId: string,
  ): Promise<{
    currency: string;
    deliveredOrders: number;
    grossRevenue: number;
    platformFeeTotal: number;
    netEarned: number;
    payoutSetupComplete: boolean;
  }> {
    const seller = await this.findSellerOrThrow(
      sellerType,
      sellerId,
      requester,
    );
    const sellerIdField = sellerType === 'store' ? 'storeId' : 'restaurantId';

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
            [sellerIdField]: seller._id.toString(),
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
      currency: seller.currency,
      deliveredOrders: summary?.deliveredOrders ?? 0,
      grossRevenue: summary?.grossRevenue ?? 0,
      platformFeeTotal: summary?.platformFeeTotal ?? 0,
      netEarned: summary?.netEarned ?? 0,
      payoutSetupComplete: seller.payoutAccounts.some(
        (account) => account.status === 'active',
      ),
    };
  }

  /**
   * A seller's detailed sales report (docs/ROADMAP.md FDP-64), generalized to stores in FDP-102
   * (same gap/reasoning as `getEarningsSummary` above) — date-range filterable revenue/COGS/
   * profit, broken down by item and by day. Same "only DELIVERED orders count" convention as
   * getEarningsSummary above, filtered on `deliveredAt` rather than `createdAt` (a scheduled
   * order placed in one period but delivered in another belongs to the period it was actually
   * fulfilled in). COGS is computed from each OrderItem's snapshotted `costPrice`, which is null
   * for any item that had no cost price set at order time — those contribute 0 to COGS (never
   * silently treated as free), and are surfaced separately via
   * `itemsMissingCostPrice`/`hasIncompleteCostData` so the owner knows the profit figures are
   * incomplete rather than trusting a number that understates true cost.
   */
  async getSalesReport(
    requester: AccessTokenPayload,
    sellerType: 'restaurant' | 'store',
    sellerId: string,
    from?: Date,
    to?: Date,
  ): Promise<SalesReport> {
    const seller = await this.findSellerOrThrow(
      sellerType,
      sellerId,
      requester,
    );

    const [result] = await this.orderModel
      .aggregate<{
        totals: {
          orders: number;
          revenue: number;
          deliveryFeeTotal: number;
          serviceFeeTotal: number;
          taxTotal: number;
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
            sellerType,
            seller._id.toString(),
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
                  taxTotal: { $sum: '$tax' },
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
      currency: seller.currency,
      range: { from: from ?? null, to: to ?? null },
      totals: {
        orders,
        revenue: round2(revenue),
        deliveryFeeTotal: round2(totals?.deliveryFeeTotal ?? 0),
        serviceFeeTotal: round2(totals?.serviceFeeTotal ?? 0),
        taxTotal: round2(totals?.taxTotal ?? 0),
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
    sellerType: 'restaurant' | 'store',
    sellerId: string,
    from?: Date,
    to?: Date,
  ): Promise<OrderDocument[]> {
    const seller = await this.findSellerOrThrow(
      sellerType,
      sellerId,
      requester,
    );

    return this.orderModel
      .find(
        this.deliveredOrdersMatch(sellerType, seller._id.toString(), from, to),
      )
      .sort({ deliveredAt: 1 })
      .exec();
  }

  /** Shared `$match` stage for both sales-report queries above — .toString(), never the raw
   * ObjectId (Mongoose 9 quirk, ref fields in this schema store as strings). */
  private deliveredOrdersMatch(
    sellerType: 'restaurant' | 'store',
    sellerId: string,
    from?: Date,
    to?: Date,
  ): Record<string, unknown> {
    const match: Record<string, unknown> = {
      [sellerType === 'store' ? 'storeId' : 'restaurantId']: sellerId,
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

  /** Vendor-scoped counterpart of `findAllForAdmin` below (docs/ROADMAP.md FDP-129) — the same
   * per-order fee breakdown, paginated, so a restaurant/store owner can see exactly what was
   * deducted from every one of their own delivered orders rather than only the aggregated stats
   * `getSalesReport` shows. Reuses `deliveredOrdersMatch` (DELIVERED-only, `deliveredAt`-ranged)
   * so this list always covers the exact same orders the sales report's stat cards/breakdowns
   * above it already summarize — a vendor comparing the two never sees a mismatched order count. */
  async getSalesReportTransactions(
    requester: AccessTokenPayload,
    sellerType: 'restaurant' | 'store',
    sellerId: string,
    from: Date | undefined,
    to: Date | undefined,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<OrderTransaction>> {
    const seller = await this.findSellerOrThrow(
      sellerType,
      sellerId,
      requester,
    );
    const match = this.deliveredOrdersMatch(
      sellerType,
      seller._id.toString(),
      from,
      to,
    );

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(match)
        .sort({ deliveredAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.orderModel.countDocuments(match).exec(),
    ]);

    const vendor: OrderTransactionVendor = {
      type: sellerType,
      id: seller._id.toString(),
      name: seller.name,
    };
    const items: OrderTransaction[] = orders.map((order) => ({
      ...this.toOrderTransactionCore(order),
      vendor,
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
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

  /** Reference figures for the "how fees work" explanation shown before the admin transactions
   * ledger and a vendor's sales-report transactions list (docs/ROADMAP.md FDP-129) — reads the
   * same constants real orders are computed from (PLATFORM_COMMISSION_RATE, SERVICE_FEE_RATE,
   * TAX_RATE_TABLE), so the blurb can never drift out of sync with what's actually charged. No
   * `@Roles()` restriction on the controller route — both an admin and any vendor need this, and
   * it's non-sensitive (a fixed reference table, not per-order/per-user data). */
  getFeeSchedule(): FeeSchedule {
    const taxRatesByCurrency: Record<string, number> = {};
    for (const [currency, rate] of Object.entries(TAX_RATE_TABLE)) {
      taxRatesByCurrency[currency] = round2(rate * 100);
    }
    return {
      platformCommissionRatePct: round2(PLATFORM_COMMISSION_RATE * 100),
      serviceFeeRatePct: round2(SERVICE_FEE_RATE * 100),
      taxRatesByCurrency,
    };
  }

  /** Builds every `OrderTransaction` field except `vendor` (the one thing that differs between
   * the admin-wide ledger, which resolves a batch of different vendors, and the vendor-scoped
   * sales-report list, which already knows its single vendor) — shared by `findAllForAdmin` and
   * `getSalesReportTransactions` so the fee-percentage math below exists in exactly one place.
   * See `OrderTransaction`'s own doc comment for why every `*RatePct` is derived from THIS
   * order's own stored amounts rather than the platform's current global rate constants. */
  private toOrderTransactionCore(
    order: OrderDocument,
  ): Omit<OrderTransaction, 'vendor'> {
    const taxableBase = round2(
      order.subtotal + order.deliveryFee + order.serviceFee - order.discount,
    );
    const platformFeeRatePct =
      order.subtotal > 0
        ? round2((order.platformFeeAmount / order.subtotal) * 100)
        : round2(PLATFORM_COMMISSION_RATE * 100);
    const serviceFeeRatePct =
      order.subtotal > 0
        ? round2((order.serviceFee / order.subtotal) * 100)
        : round2(SERVICE_FEE_RATE * 100);
    const taxRatePct =
      taxableBase > 0
        ? round2((order.tax / taxableBase) * 100)
        : round2(this.taxResolver.getRate(order.currency) * 100);
    const deliveryFeeSharePct =
      order.total > 0 ? round2((order.deliveryFee / order.total) * 100) : 0;

    return {
      _id: order._id.toString(),
      orderNumber: order.orderNumber,
      items: order.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        price: item.price,
      })),
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      serviceFee: order.serviceFee,
      tax: order.tax,
      discount: order.discount,
      total: order.total,
      platformFeeAmount: order.platformFeeAmount,
      payoutAmount: order.restaurantPayoutAmount,
      platformFeeRatePct,
      serviceFeeRatePct,
      taxRatePct,
      deliveryFeeSharePct,
      currency: order.currency,
      status: order.status,
      paymentStatus: order.paymentStatus,
      // `createdAt` is injected by Mongoose's `timestamps: true` option, not declared on the
      // `Order` class itself, so it isn't part of `OrderDocument`'s static type — the same gap
      // `campaign.toObject()`'s spread sidesteps in AdCampaignsService.attachVendorNames; here
      // a single targeted cast is simpler than a full toObject() spread for one field.
      createdAt: (order as unknown as { createdAt: Date }).createdAt,
      deliveredAt: order.deliveredAt,
    };
  }

  /**
   * Admin-wide, paginated order transaction ledger (docs/ROADMAP.md FDP-128) — the audit view
   * `getAnalyticsSummary` above never provided: every individual order across every vendor, not
   * just aggregate counts. Deliberately returns every order in range regardless of status (not
   * DELIVERED-only like getSalesReport/getEarningsSummary) — an auditor needs to see cancelled
   * and failed-payment orders too, each with its own status/paymentStatus badge, not just the
   * successful ones. `totalsByCurrency` is computed separately from the paginated page (same
   * `paymentStatus: succeeded|refunded` "money actually collected" definition
   * `getAnalyticsSummary` already established) so the figure reflects the *entire* filtered set,
   * not just whichever page is currently displayed — grouped by currency, never summed together,
   * for the same genuinely-multi-currency reason `getAnalyticsSummary`'s own comment documents.
   */
  async findAllForAdmin(query: ListOrderTransactionsQueryDto): Promise<
    PaginatedResult<OrderTransaction> & {
      totalsByCurrency: Record<string, number>;
    }
  > {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const filter: Record<string, unknown> = {};
    if (query.vendorType) filter.sellerType = query.vendorType;
    if (query.from || query.to) {
      const createdAt: Record<string, Date> = {};
      if (query.from) createdAt.$gte = new Date(query.from);
      if (query.to) createdAt.$lte = new Date(query.to);
      filter.createdAt = createdAt;
    }

    const [orders, total, revenueRows] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
      this.orderModel
        .aggregate<{ _id: string; total: number }>([
          {
            $match: {
              ...filter,
              paymentStatus: { $in: ['succeeded', 'refunded'] },
            },
          },
          { $group: { _id: '$currency', total: { $sum: '$total' } } },
        ])
        .exec(),
    ]);

    // Batched vendor-name resolution, same Map<id,name> pattern
    // AdCampaignsService.findAllForAdmin/PromoCodesService.findAll already use — `!= null`
    // (loose), not `!== null`, for the same legacy-doc safety FDP-114's postmortem documents.
    const restaurantIds = [
      ...new Set(
        orders
          .filter(
            (o) => o.sellerType === 'restaurant' && o.restaurantId != null,
          )
          .map((o) => o.restaurantId!.toString()),
      ),
    ];
    const storeIds = [
      ...new Set(
        orders
          .filter((o) => o.sellerType === 'store' && o.storeId != null)
          .map((o) => o.storeId!.toString()),
      ),
    ];
    const [restaurants, stores] = await Promise.all([
      restaurantIds.length > 0
        ? this.restaurantsService.findByIds(restaurantIds)
        : Promise.resolve([]),
      storeIds.length > 0
        ? this.storesService.findByIds(storeIds)
        : Promise.resolve([]),
    ]);
    const restaurantNameById = new Map(
      restaurants.map((r) => [r._id.toString(), r.name] as const),
    );
    const storeNameById = new Map(
      stores.map((s) => [s._id.toString(), s.name] as const),
    );

    const items: OrderTransaction[] = orders.map((order) => {
      let vendor: OrderTransactionVendor;
      if (order.sellerType === 'store' && order.storeId != null) {
        const id = order.storeId.toString();
        vendor = {
          type: 'store',
          id,
          name: storeNameById.get(id) ?? 'Unknown store',
        };
      } else if (order.restaurantId != null) {
        const id = order.restaurantId.toString();
        vendor = {
          type: 'restaurant',
          id,
          name: restaurantNameById.get(id) ?? 'Unknown restaurant',
        };
      } else {
        vendor = {
          type: 'restaurant',
          id: order._id.toString(),
          name: 'Unknown vendor',
        };
      }

      return { ...this.toOrderTransactionCore(order), vendor };
    });

    const totalsByCurrency: Record<string, number> = {};
    for (const row of revenueRows)
      totalsByCurrency[row._id] = round2(row.total);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      totalsByCurrency,
    };
  }
}
