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
import {
  Restaurant,
  RestaurantDocument,
} from '../restaurants/schemas/restaurant.schema';

function orderRoom(orderId: string): string {
  return `order:${orderId}`;
}

function restaurantRoom(restaurantId: string): string {
  return `restaurant:${restaurantId}`;
}

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

  /** Called by `OrdersService` after every successful status transition. */
  emitOrderStatusChanged(order: OrderDocument): void {
    this.server
      .to(orderRoom(order._id.toString()))
      .emit('order:statusChanged', order);
    this.server
      .to(restaurantRoom(order.restaurantId.toString()))
      .emit('restaurant:orderUpdated', order);
  }
}
