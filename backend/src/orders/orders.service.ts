import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { generateOrderNumber } from '../common/utils/order-number';
import { Order, OrderDocument } from './schemas/order.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { canOwnerTransition, canRiderTransition } from './order-state-machine';
import type { OrderStatus } from './schemas/order-status';
import type { PaymentProvider } from '../payments/payment-provider';

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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class OrdersService {
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
  ) {}

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
    const availability = await this.menuItemModel
      .find(
        { _id: { $in: cart.items.map((i) => i.menuItemId) } },
        { isAvailable: 1 },
      )
      .exec();
    const unavailable = cart.items.find((item) => {
      const current = availability.find(
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

    order.status = targetStatus;
    order.statusHistory.push({
      status: targetStatus,
      at: new Date(),
      by: riderUserId,
    });
    await order.save();

    this.realtimeGateway.emitOrderStatusChanged(order);
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
   * has actually paid, so a later webhook delivery can look the order back up by reference. */
  async setPaymentRef(
    order: OrderDocument,
    provider: PaymentProvider,
    paymentRef: string,
  ): Promise<OrderDocument> {
    order.paymentProvider = provider;
    order.paymentRef = paymentRef;
    return order.save();
  }

  findByPaymentRef(reference: string): Promise<OrderDocument | null> {
    return this.orderModel.findOne({ paymentRef: reference }).exec();
  }

  /**
   * The *only* place `PENDING_PAYMENT` → `PLACED` happens (see order-state-machine.ts) —
   * called exclusively from `PaymentsService` after a webhook signature has been verified.
   * Idempotent: providers retry webhook delivery, and a second delivery for an order that's
   * already past `PENDING_PAYMENT` is a silent no-op, not an error.
   */
  async markPaidFromWebhook(orderId: string): Promise<OrderDocument | null> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) return null;
    if (order.status !== 'PENDING_PAYMENT') return order;

    order.paymentStatus = 'succeeded';
    order.status = 'PLACED';
    order.statusHistory.push({
      status: 'PLACED',
      at: new Date(),
      by: 'system',
    });
    await order.save();

    this.realtimeGateway.emitOrderStatusChanged(order);
    return order;
  }

  /** A failed/declined payment attempt — the order stays in `PENDING_PAYMENT` so the customer
   * can retry (possibly with a different provider), it just stops looking like a silent hang. */
  async markPaymentFailed(orderId: string): Promise<OrderDocument | null> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) return null;
    // Never downgrade a payment that another (successful) webhook already confirmed — provider
    // webhook delivery order isn't guaranteed.
    if (order.paymentStatus === 'succeeded') return order;

    order.paymentStatus = 'failed';
    await order.save();

    this.realtimeGateway.emitOrderStatusChanged(order);
    return order;
  }
}
