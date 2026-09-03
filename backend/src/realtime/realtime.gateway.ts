import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Model } from 'mongoose';
import type { Server, Socket } from 'socket.io';
import { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import type { OrderStatus } from '../orders/schemas/order-status';
import {
  Restaurant,
  RestaurantDocument,
} from '../restaurants/schemas/restaurant.schema';
import { Store, StoreDocument } from '../stores/schemas/store.schema';

function orderRoom(orderId: string): string {
  return `order:${orderId}`;
}

function restaurantRoom(restaurantId: string): string {
  return `restaurant:${restaurantId}`;
}

function storeRoom(storeId: string): string {
  return `store:${storeId}`;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

/** Statuses where a rider's live position is actually meaningful to broadcast — matches the
 * frontend rider dashboard's own ACTIVE_RIDER_STATUSES (docs/ROADMAP.md FDP-16/17). */
const ACTIVE_DELIVERY_STATUSES: OrderStatus[] = [
  'ASSIGNED_TO_RIDER',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
];

/**
 * Reads the connected user off the socket rather than the request — `@nestjs/websockets`
 * doesn't run the HTTP `JwtAuthGuard`, so auth happens once at `handleConnection` instead (see
 * that method for why this gateway can't just reuse the REST guards).
 */
interface AuthedSocket extends Socket {
  data: { user?: AccessTokenPayload };
}

/**
 * Injects the Order/Restaurant Mongoose models directly (not `OrdersService`/
 * `RestaurantsService`) — `OrdersModule` depends on this module to emit events, so depending
 * back on `OrdersModule` here would be circular. This narrow read-only ownership check is the
 * one deliberate exception to backend/CLAUDE.md's "ownership checks live in the service layer"
 * convention, for that reason.
 */
// `@WebSocketGateway()`'s options are evaluated when this file is first imported — before
// `ConfigModule.forRoot()` has loaded `.env` into `process.env` (that only happens once
// `NestFactory.create()` runs, inside `bootstrap()`) — so this can't read `CORS_ORIGINS` the
// way `setup-app.ts` does for the REST API. Reflecting the request origin here is a smaller
// risk than it looks: unlike the REST API's cookie-based refresh flow, this gateway
// authenticates via a bearer token in `handshake.auth.token` (see `handleConnection`), which a
// cross-origin page has no way to read out of another origin's in-memory Redux store — so a
// forged connection attempt from an attacker's page can open a socket but can never
// authenticate one.
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
    @InjectModel(Store.name) private readonly storeModel: Model<StoreDocument>,
  ) {}

  /**
   * Verified once at connection time (from `handshake.auth.token`, the same short-lived access
   * token used for REST calls) rather than per-message — a reasonable v1 tradeoff given access
   * tokens are ~15 min: a client whose token expires mid-connection just reconnects with a
   * fresh one on its next page load, the same way REST calls silently re-auth via
   * `baseQueryWithReauth`. Nothing here trusts a client-asserted user id.
   */
  async handleConnection(client: AuthedSocket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET') },
      );
      client.data.user = payload;
      // Every authenticated connection joins its own user room unconditionally — unlike
      // `order:subscribe`/`restaurant:subscribe`, there's no separate ownership check needed
      // here, since a user always owns their own notification stream.
      await client.join(userRoom(payload.sub));
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('order:subscribe')
  async handleOrderSubscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { orderId?: string },
  ): Promise<void> {
    const user = client.data.user;
    const orderId = body?.orderId;
    if (!user || !orderId) return;

    const order = await this.orderModel
      .findById(orderId)
      .select('customerId')
      .exec();
    if (!order) return;
    if (order.customerId.toString() !== user.sub && user.role !== 'admin') {
      this.logger.warn(
        `User ${user.sub} tried to subscribe to order ${orderId} they don't own`,
      );
      return;
    }

    await client.join(orderRoom(orderId));
  }

  @SubscribeMessage('restaurant:subscribe')
  async handleRestaurantSubscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { restaurantId?: string },
  ): Promise<void> {
    const user = client.data.user;
    const restaurantId = body?.restaurantId;
    if (!user || !restaurantId) return;

    const restaurant = await this.restaurantModel
      .findById(restaurantId)
      .select('ownerId')
      .exec();
    if (!restaurant) return;
    if (restaurant.ownerId.toString() !== user.sub && user.role !== 'admin') {
      this.logger.warn(
        `User ${user.sub} tried to subscribe to restaurant ${restaurantId} they don't own`,
      );
      return;
    }

    await client.join(restaurantRoom(restaurantId));
  }

  // Store-catalog counterpart of `restaurant:subscribe` (docs/ROADMAP.md FDP-56).
  @SubscribeMessage('store:subscribe')
  async handleStoreSubscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { storeId?: string },
  ): Promise<void> {
    const user = client.data.user;
    const storeId = body?.storeId;
    if (!user || !storeId) return;

    const store = await this.storeModel
      .findById(storeId)
      .select('ownerId')
      .exec();
    if (!store) return;
    if (store.ownerId.toString() !== user.sub && user.role !== 'admin') {
      this.logger.warn(
        `User ${user.sub} tried to subscribe to store ${storeId} they don't own`,
      );
      return;
    }

    await client.join(storeRoom(storeId));
  }

  /**
   * A rider's live GPS ping (docs/ROADMAP.md FDP-17) — deliberately not persisted anywhere
   * (no `Rider.currentLocation` field), purely relayed to whichever order rooms currently need
   * it. The client only sends `{lat, lng}`; the server looks up *all* of that rider's
   * in-flight orders itself rather than trusting a client-supplied orderId, so a rider with
   * more than one active delivery updates every room in one ping.
   */
  @SubscribeMessage('rider:locationUpdate')
  async handleRiderLocation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { lat?: number; lng?: number },
  ): Promise<void> {
    const user = client.data.user;
    if (!user || user.role !== 'rider') return;
    if (typeof body?.lat !== 'number' || typeof body?.lng !== 'number') return;

    const activeOrders = await this.orderModel
      .find({ riderId: user.sub, status: { $in: ACTIVE_DELIVERY_STATUSES } })
      .select('_id')
      .exec();
    if (activeOrders.length === 0) return;

    const payload = { lat: body.lat, lng: body.lng, at: new Date() };
    for (const order of activeOrders) {
      this.server
        .to(orderRoom(order._id.toString()))
        .emit('order:riderLocation', payload);
    }
  }

  /** Called by `OrdersService` after every successful status transition. */
  emitOrderStatusChanged(order: OrderDocument): void {
    this.server
      .to(orderRoom(order._id.toString()))
      .emit('order:statusChanged', order);

    // docs/ROADMAP.md FDP-56 — exactly one of these is set, matching order.sellerType.
    if (order.sellerType === 'store' && order.storeId) {
      this.server
        .to(storeRoom(order.storeId.toString()))
        .emit('store:orderUpdated', order);
    } else if (order.restaurantId) {
      this.server
        .to(restaurantRoom(order.restaurantId.toString()))
        .emit('restaurant:orderUpdated', order);
    }
  }

  /** Called by `NotificationsService` right after persisting a new in-app notification
   * (docs/ROADMAP.md FDP-19), so a connected client's bell updates live instead of only on the
   * next `listNotifications`/`unreadCount` poll. */
  emitNotification(userId: string, notification: unknown): void {
    this.server.to(userRoom(userId)).emit('notification:new', notification);
  }
}
