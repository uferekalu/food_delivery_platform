import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { OrdersService } from './orders.service';
import { CartService } from '../cart/cart.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { PromoCodesService } from '../promo-codes/promo-codes.service';
import { PaymentProviderResolver } from '../payments/provider-resolver';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Order, OrderDocument, OrderSchema } from './schemas/order.schema';
import type { OrderStatus } from './schemas/order-status';
import { Cart, CartDocument, CartSchema } from '../cart/schemas/cart.schema';
import {
  Restaurant,
  RestaurantDocument,
  RestaurantSchema,
} from '../restaurants/schemas/restaurant.schema';
import {
  MenuItem,
  MenuItemDocument,
  MenuItemSchema,
} from '../menu/schemas/menu-item.schema';
import {
  PromoCode,
  PromoCodeSchema,
} from '../promo-codes/schemas/promo-code.schema';

jest.setTimeout(30_000);

describe('OrdersService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let ordersService: OrdersService;
  let cartService: CartService;
  let restaurantsService: RestaurantsService;
  let promoCodesService: PromoCodesService;
  let realtimeGateway: { emitOrderStatusChanged: jest.Mock };
  let restaurantModel: Model<RestaurantDocument>;
  let itemModel: Model<MenuItemDocument>;
  let cartModel: Model<CartDocument>;
  let orderModel: Model<OrderDocument>;

  const userId = 'customer-id';
  const validAddress = { line1: '1 Main St', city: 'Lagos', state: 'Lagos' };

  beforeAll(async () => {
    // See backend/CLAUDE.md ("Testing") for why launchTimeout is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Order.name, schema: OrderSchema },
          { name: Cart.name, schema: CartSchema },
          { name: Restaurant.name, schema: RestaurantSchema },
          { name: MenuItem.name, schema: MenuItemSchema },
          { name: PromoCode.name, schema: PromoCodeSchema },
        ]),
      ],
      providers: [
        OrdersService,
        CartService,
        RestaurantsService,
        PromoCodesService,
        PaymentProviderResolver,
        {
          provide: RealtimeGateway,
          useValue: { emitOrderStatusChanged: jest.fn() },
        },
      ],
    }).compile();

    ordersService = moduleRef.get(OrdersService);
    cartService = moduleRef.get(CartService);
    restaurantsService = moduleRef.get(RestaurantsService);
    promoCodesService = moduleRef.get(PromoCodesService);
    realtimeGateway = moduleRef.get(RealtimeGateway);
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    itemModel = moduleRef.get(getModelToken(MenuItem.name));
    cartModel = moduleRef.get(getModelToken(Cart.name));
    orderModel = moduleRef.get(getModelToken(Order.name));
  }, 60_000);

  afterEach(async () => {
    await Promise.all([
      restaurantModel.deleteMany({}).exec(),
      itemModel.deleteMany({}).exec(),
      cartModel.deleteMany({}).exec(),
      orderModel.deleteMany({}).exec(),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  async function createApprovedRestaurant(currency = 'NGN') {
    const restaurant = await restaurantsService.create('owner-id', {
      name: 'Burgundy Kitchen',
      cuisineTypes: ['Nigerian'],
      currency,
      country: 'Nigeria',
      address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
    });
    return restaurantsService.approve(restaurant._id.toString());
  }

  async function createItem(restaurantId: string, price = 10) {
    return itemModel.create({
      restaurantId,
      categoryId: restaurantId,
      name: 'Jollof Rice',
      price,
      isAvailable: true,
    });
  }

  it('rejects an empty cart', async () => {
    await expect(
      ordersService.createOrder(userId, { deliveryAddress: validAddress }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates an order in PENDING_PAYMENT, computes fees, resolves a provider, and clears the cart', async () => {
    const restaurant = await createApprovedRestaurant('NGN');
    const item = await createItem(restaurant._id.toString(), 100);
    await cartService.addItem(userId, {
      menuItemId: item._id.toString(),
      qty: 2,
    }); // subtotal 200

    const order = await ordersService.createOrder(userId, {
      deliveryAddress: validAddress,
    });

    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.statusHistory).toHaveLength(1);
    expect(order.statusHistory[0].status).toBe('PENDING_PAYMENT');
    expect(order.subtotal).toBe(200);
    expect(order.deliveryFee).toBe(20); // 10% of 200
    expect(order.serviceFee).toBe(10); // 5% of 200
    expect(order.tax).toBe(0);
    expect(order.discount).toBe(0);
    expect(order.total).toBe(230);
    expect(order.currency).toBe('NGN');
    expect(order.paymentProvider).toBe('paystack'); // NGN default per the routing table
    expect(order.paymentStatus).toBe('pending');
    expect(order.orderNumber).toMatch(/^ORD-/);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].name).toBe('Jollof Rice');

    const cartAfter = await cartService.getCart(userId);
    expect(cartAfter.items).toHaveLength(0);
  });

  it('resolves Stripe as the default provider for a global currency', async () => {
    const restaurant = await createApprovedRestaurant('USD');
    const item = await createItem(restaurant._id.toString(), 10);
    await cartService.addItem(userId, { menuItemId: item._id.toString() });

    const order = await ordersService.createOrder(userId, {
      deliveryAddress: validAddress,
    });
    expect(order.paymentProvider).toBe('stripe');
  });

  it('rejects a scheduledFor time in the past', async () => {
    const restaurant = await createApprovedRestaurant();
    const item = await createItem(restaurant._id.toString());
    await cartService.addItem(userId, { menuItemId: item._id.toString() });

    await expect(
      ordersService.createOrder(userId, {
        deliveryAddress: validAddress,
        scheduledFor: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a future scheduledFor time', async () => {
    const restaurant = await createApprovedRestaurant();
    const item = await createItem(restaurant._id.toString());
    await cartService.addItem(userId, { menuItemId: item._id.toString() });

    const future = new Date(Date.now() + 3_600_000).toISOString();
    const order = await ordersService.createOrder(userId, {
      deliveryAddress: validAddress,
      scheduledFor: future,
    });
    expect(order.scheduledFor?.toISOString()).toBe(
      new Date(future).toISOString(),
    );
  });

  it('rejects checkout when an item was made unavailable after being added to the cart', async () => {
    const restaurant = await createApprovedRestaurant();
    const item = await createItem(restaurant._id.toString());
    await cartService.addItem(userId, { menuItemId: item._id.toString() });

    await itemModel.updateOne({ _id: item._id }, { isAvailable: false }).exec();

    await expect(
      ordersService.createOrder(userId, { deliveryAddress: validAddress }),
    ).rejects.toThrow(BadRequestException);
  });

  it('applies a valid promo code, recording the discount and redeeming it', async () => {
    const restaurant = await createApprovedRestaurant();
    const item = await createItem(restaurant._id.toString(), 100);
    await cartService.addItem(userId, { menuItemId: item._id.toString() });
    const promo = await promoCodesService.create({
      code: 'SAVE10',
      discountType: 'fixed',
      discountValue: 10,
    });

    const order = await ordersService.createOrder(userId, {
      deliveryAddress: validAddress,
      promoCode: 'SAVE10',
    });

    expect(order.discount).toBe(10);
    expect(order.promoCode).toBe('SAVE10');
    expect(order.total).toBe(
      order.subtotal + order.deliveryFee + order.serviceFee - 10,
    );

    const promoAfter = await promoCodesService.findAll();
    expect(
      promoAfter.find((p) => p._id.toString() === promo._id.toString())
        ?.usedCount,
    ).toBe(1);
  });

  it('rejects an invalid promo code and does not create the order', async () => {
    const restaurant = await createApprovedRestaurant();
    const item = await createItem(restaurant._id.toString());
    await cartService.addItem(userId, { menuItemId: item._id.toString() });

    await expect(
      ordersService.createOrder(userId, {
        deliveryAddress: validAddress,
        promoCode: 'NOPE',
      }),
    ).rejects.toThrow(BadRequestException);

    const orders = await ordersService.findMine(userId);
    expect(orders).toHaveLength(0);
    // Cart should still be intact — nothing was consumed by the failed attempt.
    const cart = await cartService.getCart(userId);
    expect(cart.items).toHaveLength(1);
  });

  it("findOne enforces ownership and findMine lists only the caller's orders", async () => {
    const restaurant = await createApprovedRestaurant();
    const item = await createItem(restaurant._id.toString());
    await cartService.addItem(userId, { menuItemId: item._id.toString() });
    const order = await ordersService.createOrder(userId, {
      deliveryAddress: validAddress,
    });

    const found = await ordersService.findOne(userId, order._id.toString());
    expect(found._id.toString()).toBe(order._id.toString());

    await expect(
      ordersService.findOne('someone-else', order._id.toString()),
    ).rejects.toThrow();

    const mine = await ordersService.findMine(userId);
    expect(mine).toHaveLength(1);
    const someoneElses = await ordersService.findMine('someone-else');
    expect(someoneElses).toHaveLength(0);
  });

  // PENDING_PAYMENT→PLACED is exclusively FDP-14's webhook (see order-state-machine.ts) — not
  // reachable through any service method yet, so these tests seed an order directly at PLACED
  // via the model rather than going through `createOrder`.
  async function createOrderAtStatus(
    restaurantId: string,
    status: OrderStatus,
  ) {
    return orderModel.create({
      orderNumber: `ORD-TEST-${Math.random().toString(36).slice(2, 8)}`,
      customerId: userId,
      restaurantId,
      items: [
        {
          menuItemId: restaurantId,
          name: 'Jollof Rice',
          price: 10,
          qty: 1,
          selectedModifiers: [],
          notes: '',
        },
      ],
      subtotal: 10,
      deliveryFee: 1,
      serviceFee: 0.5,
      tax: 0,
      discount: 0,
      total: 11.5,
      currency: 'NGN',
      status,
      statusHistory: [{ status, at: new Date(), by: userId }],
      paymentProvider: 'paystack',
      paymentStatus: 'pending',
      deliveryAddress: validAddress,
    });
  }

  describe('findForRestaurant', () => {
    it("returns only that restaurant's active orders, oldest first", async () => {
      const restaurant = await createApprovedRestaurant();
      const other = await createApprovedRestaurant();
      const placed = await createOrderAtStatus(
        restaurant._id.toString(),
        'PLACED',
      );
      await createOrderAtStatus(restaurant._id.toString(), 'DELIVERED'); // not active
      await createOrderAtStatus(other._id.toString(), 'PLACED'); // different restaurant
      const preparing = await createOrderAtStatus(
        restaurant._id.toString(),
        'PREPARING',
      );

      const owner = {
        sub: 'owner-id',
        email: 'owner@test.local',
        role: 'restaurant_owner',
      } as const;
      const queue = await ordersService.findForRestaurant(
        owner,
        restaurant._id.toString(),
      );

      expect(queue.map((o) => o._id.toString())).toEqual([
        placed._id.toString(),
        preparing._id.toString(),
      ]);
    });

    it('rejects a caller who does not own the restaurant', async () => {
      const restaurant = await createApprovedRestaurant();
      const intruder = {
        sub: 'someone-else',
        email: 'intruder@test.local',
        role: 'restaurant_owner',
      } as const;

      await expect(
        ordersService.findForRestaurant(intruder, restaurant._id.toString()),
      ).rejects.toThrow();
    });
  });

  describe('updateStatusByOwner', () => {
    const owner = {
      sub: 'owner-id',
      email: 'owner@test.local',
      role: 'restaurant_owner',
    } as const;

    it('accepts a PLACED order, records history, and emits a realtime event', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'PLACED',
      );

      const updated = await ordersService.updateStatusByOwner(
        owner,
        order._id.toString(),
        'ACCEPTED_BY_RESTAURANT',
      );

      expect(updated.status).toBe('ACCEPTED_BY_RESTAURANT');
      expect(updated.statusHistory).toHaveLength(2);
      expect(updated.statusHistory[1]).toMatchObject({
        status: 'ACCEPTED_BY_RESTAURANT',
        by: 'owner-id',
      });
      expect(realtimeGateway.emitOrderStatusChanged).toHaveBeenCalledTimes(1);
    });

    it('rejects a transition not allowed by the state machine', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'PLACED',
      );

      await expect(
        ordersService.updateStatusByOwner(
          owner,
          order._id.toString(),
          'DELIVERED',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects PENDING_PAYMENT→PLACED even from the owner endpoint', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'PENDING_PAYMENT',
      );

      await expect(
        ordersService.updateStatusByOwner(
          owner,
          order._id.toString(),
          'PLACED',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a caller who does not own the restaurant', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'PLACED',
      );
      const intruder = {
        sub: 'someone-else',
        email: 'intruder@test.local',
        role: 'restaurant_owner',
      } as const;

      await expect(
        ordersService.updateStatusByOwner(
          intruder,
          order._id.toString(),
          'ACCEPTED_BY_RESTAURANT',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows an admin to act on any restaurant', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'PLACED',
      );
      const admin = {
        sub: 'admin-id',
        email: 'admin@test.local',
        role: 'admin',
      } as const;

      const updated = await ordersService.updateStatusByOwner(
        admin,
        order._id.toString(),
        'ACCEPTED_BY_RESTAURANT',
      );
      expect(updated.status).toBe('ACCEPTED_BY_RESTAURANT');
    });
  });

  describe('payment webhook flow', () => {
    it('setPaymentRef records the provider/reference without changing status', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'PENDING_PAYMENT',
      );

      const updated = await ordersService.setPaymentRef(
        order,
        'stripe',
        'cs_test_abc123',
      );

      expect(updated.paymentProvider).toBe('stripe');
      expect(updated.paymentRef).toBe('cs_test_abc123');
      expect(updated.status).toBe('PENDING_PAYMENT');
    });

    it('findByPaymentRef finds the order that ref was set on', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'PENDING_PAYMENT',
      );
      await ordersService.setPaymentRef(order, 'stripe', 'cs_test_xyz');

      const found = await ordersService.findByPaymentRef('cs_test_xyz');
      expect(found?._id.toString()).toBe(order._id.toString());

      const notFound = await ordersService.findByPaymentRef('nope');
      expect(notFound).toBeNull();
    });

    it('markPaidFromWebhook moves PENDING_PAYMENT to PLACED and is idempotent on replay', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'PENDING_PAYMENT',
      );

      const first = await ordersService.markPaidFromWebhook(
        order._id.toString(),
      );
      expect(first?.status).toBe('PLACED');
      expect(first?.paymentStatus).toBe('succeeded');
      expect(first?.statusHistory.at(-1)).toMatchObject({
        status: 'PLACED',
        by: 'system',
      });

      // A retried webhook delivery for the same (already-paid) order must not double-transition
      // or duplicate the status history entry.
      const second = await ordersService.markPaidFromWebhook(
        order._id.toString(),
      );
      expect(second?.status).toBe('PLACED');
      expect(second?.statusHistory).toHaveLength(2); // PENDING_PAYMENT, PLACED — not 3

      expect(realtimeGateway.emitOrderStatusChanged).toHaveBeenCalled();
    });

    it('markPaidFromWebhook returns null for an unknown order id', async () => {
      const restaurant = await createApprovedRestaurant();
      const missingId = restaurant._id.toString(); // any valid-shaped id that isn't an order
      const result = await ordersService.markPaidFromWebhook(missingId);
      expect(result).toBeNull();
    });

    it('markPaymentFailed sets paymentStatus without changing order status', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'PENDING_PAYMENT',
      );

      const updated = await ordersService.markPaymentFailed(
        order._id.toString(),
      );
      expect(updated?.paymentStatus).toBe('failed');
      expect(updated?.status).toBe('PENDING_PAYMENT'); // stays retryable
    });

    it('markPaymentFailed never downgrades an already-succeeded payment', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'PENDING_PAYMENT',
      );
      await ordersService.markPaidFromWebhook(order._id.toString());

      const updated = await ordersService.markPaymentFailed(
        order._id.toString(),
      );
      expect(updated?.paymentStatus).toBe('succeeded');
    });
  });
});
