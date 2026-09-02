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
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  DeliveryZone,
  DeliveryZoneDocument,
  DeliveryZoneSchema,
} from '../delivery-zones/schemas/delivery-zone.schema';
import { Order, OrderDocument, OrderSchema } from './schemas/order.schema';
import type { OrderStatus, OrderPaymentStatus } from './schemas/order-status';
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
  let deliveryZonesService: DeliveryZonesService;
  let realtimeGateway: { emitOrderStatusChanged: jest.Mock };
  let restaurantModel: Model<RestaurantDocument>;
  let itemModel: Model<MenuItemDocument>;
  let cartModel: Model<CartDocument>;
  let orderModel: Model<OrderDocument>;
  let zoneModel: Model<DeliveryZoneDocument>;

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
          { name: DeliveryZone.name, schema: DeliveryZoneSchema },
        ]),
      ],
      providers: [
        OrdersService,
        CartService,
        RestaurantsService,
        PromoCodesService,
        PaymentProviderResolver,
        DeliveryZonesService,
        {
          provide: RealtimeGateway,
          useValue: { emitOrderStatusChanged: jest.fn() },
        },
        {
          // Notification delivery (FDP-19) is fire-and-forget from OrdersService — a resolved
          // mock is enough to keep it from surfacing as an unhandled rejection in these tests.
          provide: NotificationsService,
          useValue: { notify: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    ordersService = moduleRef.get(OrdersService);
    cartService = moduleRef.get(CartService);
    restaurantsService = moduleRef.get(RestaurantsService);
    promoCodesService = moduleRef.get(PromoCodesService);
    deliveryZonesService = moduleRef.get(DeliveryZonesService);
    realtimeGateway = moduleRef.get(RealtimeGateway);
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    itemModel = moduleRef.get(getModelToken(MenuItem.name));
    cartModel = moduleRef.get(getModelToken(Cart.name));
    orderModel = moduleRef.get(getModelToken(Order.name));
    zoneModel = moduleRef.get(getModelToken(DeliveryZone.name));
  }, 60_000);

  afterEach(async () => {
    await Promise.all([
      restaurantModel.deleteMany({}).exec(),
      itemModel.deleteMany({}).exec(),
      cartModel.deleteMany({}).exec(),
      orderModel.deleteMany({}).exec(),
      zoneModel.deleteMany({}).exec(),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  async function createApprovedRestaurant(
    currency = 'NGN',
    address: {
      line1: string;
      city: string;
      state: string;
      lat?: number;
      lng?: number;
    } = { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
  ) {
    const restaurant = await restaurantsService.create('owner-id', {
      name: 'Burgundy Kitchen',
      cuisineTypes: ['Nigerian'],
      currency,
      country: 'Nigeria',
      address,
      complianceDocumentUrl: 'https://example.com/doc.pdf',
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
    expect(order.platformFeeAmount).toBe(30); // 15% of 200 subtotal
    expect(order.restaurantPayoutAmount).toBe(170); // 200 - 30
    expect(order.currency).toBe('NGN');
    expect(order.paymentProvider).toBe('paystack'); // NGN default per the routing table
    expect(order.paymentStatus).toBe('pending');
    expect(order.orderNumber).toMatch(/^ORD-/);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].name).toBe('Jollof Rice');

    const cartAfter = await cartService.getCart(userId);
    expect(cartAfter.items).toHaveLength(0);
  });

  describe('delivery fee calculation (FDP-15)', () => {
    const owner = {
      sub: 'owner-id',
      email: 'owner@test.local',
      role: 'restaurant_owner',
    } as const;

    it('uses zone-based pricing when both restaurant and delivery address have coordinates', async () => {
      const restaurant = await createApprovedRestaurant('NGN', {
        line1: '1 Main St',
        city: 'Lagos',
        state: 'Lagos',
        lat: 6.5,
        lng: 3.3792,
      });
      await deliveryZonesService.create(restaurant._id.toString(), owner, {
        name: 'Nearby',
        maxDistanceKm: 20,
        baseFee: 300,
        perKmFee: 50,
      });
      const item = await createItem(restaurant._id.toString(), 100);
      await cartService.addItem(userId, { menuItemId: item._id.toString() });

      const order = await ordersService.createOrder(userId, {
        deliveryAddress: {
          line1: '2 Second St',
          city: 'Lagos',
          state: 'Lagos',
          lat: 6.545,
          lng: 3.3792,
        },
      });

      // ~5.01km at 0.045deg latitude, same longitude — not the flat 10% placeholder (10).
      expect(order.deliveryFee).toBeGreaterThan(300);
      expect(order.deliveryFee).not.toBe(10);
    });

    it('falls back to the flat rate when no zone covers the computed distance', async () => {
      const restaurant = await createApprovedRestaurant('NGN', {
        line1: '1 Main St',
        city: 'Lagos',
        state: 'Lagos',
        lat: 6.5,
        lng: 3.3792,
      });
      await deliveryZonesService.create(restaurant._id.toString(), owner, {
        name: 'Nearby only',
        maxDistanceKm: 1,
        baseFee: 300,
        perKmFee: 50,
      });
      const item = await createItem(restaurant._id.toString(), 100);
      await cartService.addItem(userId, { menuItemId: item._id.toString() });

      const order = await ordersService.createOrder(userId, {
        deliveryAddress: {
          line1: '2 Second St',
          city: 'Lagos',
          state: 'Lagos',
          lat: 6.545, // ~5km away, outside the 1km-only zone
          lng: 3.3792,
        },
      });

      expect(order.deliveryFee).toBe(10); // 10% of subtotal 100, the flat fallback
    });

    it('falls back to the flat rate when the delivery address has no coordinates', async () => {
      const restaurant = await createApprovedRestaurant('NGN', {
        line1: '1 Main St',
        city: 'Lagos',
        state: 'Lagos',
        lat: 6.5,
        lng: 3.3792,
      });
      await deliveryZonesService.create(restaurant._id.toString(), owner, {
        name: 'Nearby',
        maxDistanceKm: 20,
        baseFee: 300,
        perKmFee: 50,
      });
      const item = await createItem(restaurant._id.toString(), 100);
      await cartService.addItem(userId, { menuItemId: item._id.toString() });

      const order = await ordersService.createOrder(userId, {
        deliveryAddress: validAddress, // no lat/lng
      });

      expect(order.deliveryFee).toBe(10);
    });
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
    overrides: {
      items?: {
        menuItemId: string;
        name: string;
        price: number;
        costPrice?: number | null;
        qty: number;
      }[];
      subtotal?: number;
      deliveredAt?: Date;
      paymentStatus?: OrderPaymentStatus;
    } = {},
  ) {
    const items = overrides.items ?? [
      {
        menuItemId: restaurantId,
        name: 'Jollof Rice',
        price: 10,
        costPrice: null,
        qty: 1,
      },
    ];
    return orderModel.create({
      orderNumber: `ORD-TEST-${Math.random().toString(36).slice(2, 8)}`,
      customerId: userId,
      restaurantId,
      items: items.map((item) => ({
        ...item,
        costPrice: item.costPrice ?? null,
        selectedModifiers: [],
        notes: '',
      })),
      subtotal: overrides.subtotal ?? 10,
      deliveryFee: 1,
      serviceFee: 0.5,
      tax: 0,
      discount: 0,
      total: 11.5,
      platformFeeAmount: 1.5,
      restaurantPayoutAmount: 8.5,
      currency: 'NGN',
      status,
      statusHistory: [{ status, at: new Date(), by: userId }],
      // Sales-report date-range filtering (docs/ROADMAP.md FDP-64) — deliveredAt only makes
      // sense once an order has actually reached DELIVERED, matching
      // OrdersService.updateStatusByRider's real behavior.
      deliveredAt:
        status === 'DELIVERED' ? (overrides.deliveredAt ?? new Date()) : null,
      paymentProvider: 'paystack',
      paymentStatus: overrides.paymentStatus ?? 'pending',
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

  describe('getEarningsSummary (FDP-51)', () => {
    const owner = {
      sub: 'owner-id',
      email: 'owner@test.local',
      role: 'restaurant_owner',
    } as const;

    it('sums gross revenue, platform fee, and net earnings across DELIVERED orders only', async () => {
      const restaurant = await createApprovedRestaurant();
      await createOrderAtStatus(restaurant._id.toString(), 'DELIVERED');
      await createOrderAtStatus(restaurant._id.toString(), 'DELIVERED');
      await createOrderAtStatus(restaurant._id.toString(), 'PLACED'); // not yet earned
      await createOrderAtStatus(restaurant._id.toString(), 'REFUNDED'); // no longer earned

      const summary = await ordersService.getEarningsSummary(
        owner,
        restaurant._id.toString(),
      );

      // createOrderAtStatus's fixed fixture: subtotal 10, platformFeeAmount 1.5, restaurantPayoutAmount 8.5
      expect(summary.deliveredOrders).toBe(2);
      expect(summary.grossRevenue).toBe(20);
      expect(summary.platformFeeTotal).toBe(3);
      expect(summary.netEarned).toBe(17);
      expect(summary.currency).toBe('NGN');
      expect(summary.payoutSetupComplete).toBe(false);
    });

    it('returns zeroed totals for a restaurant with no delivered orders yet', async () => {
      const restaurant = await createApprovedRestaurant();

      const summary = await ordersService.getEarningsSummary(
        owner,
        restaurant._id.toString(),
      );

      expect(summary).toEqual({
        currency: 'NGN',
        deliveredOrders: 0,
        grossRevenue: 0,
        platformFeeTotal: 0,
        netEarned: 0,
        payoutSetupComplete: false,
      });
    });

    it('rejects a caller who does not own the restaurant', async () => {
      const restaurant = await createApprovedRestaurant();
      const intruder = {
        sub: 'someone-else',
        email: 'intruder@test.local',
        role: 'restaurant_owner',
      } as const;

      await expect(
        ordersService.getEarningsSummary(intruder, restaurant._id.toString()),
      ).rejects.toThrow();
    });
  });

  describe('getSalesReport / getSalesReportOrders (FDP-64)', () => {
    const owner = {
      sub: 'owner-id',
      email: 'owner@test.local',
      role: 'restaurant_owner',
    } as const;

    async function seedDeliveredOrders(restaurantId: string) {
      // Distinct real menu items — items.menuItemId must actually differ per item name, or the
      // sales-report aggregation's $group on menuItemId incorrectly merges different items
      // together (caught by this test itself before this fix: reusing one id for two names
      // silently grouped them under whichever name $first happened to see).
      const jollof = await createItem(restaurantId, 10);
      const chicken = await createItem(restaurantId, 15);

      // Two orders on day 1: one item has a cost price, one doesn't (missing-cost coverage).
      await createOrderAtStatus(restaurantId, 'DELIVERED', {
        items: [
          {
            menuItemId: jollof._id.toString(),
            name: 'Jollof Rice',
            price: 10,
            costPrice: 4,
            qty: 2,
          },
        ],
        subtotal: 20,
        deliveredAt: new Date('2026-01-01T10:00:00.000Z'),
      });
      await createOrderAtStatus(restaurantId, 'DELIVERED', {
        items: [
          {
            menuItemId: chicken._id.toString(),
            name: 'Chicken',
            price: 15,
            costPrice: null,
            qty: 1,
          },
        ],
        subtotal: 15,
        deliveredAt: new Date('2026-01-01T12:00:00.000Z'),
      });
      // One order on day 2, same item as the first (so byItem aggregates across orders/days).
      await createOrderAtStatus(restaurantId, 'DELIVERED', {
        items: [
          {
            menuItemId: jollof._id.toString(),
            name: 'Jollof Rice',
            price: 10,
            costPrice: 4,
            qty: 1,
          },
        ],
        subtotal: 10,
        deliveredAt: new Date('2026-01-02T10:00:00.000Z'),
      });
      // Not DELIVERED — must be excluded entirely from every figure below.
      await createOrderAtStatus(restaurantId, 'PLACED');
      await createOrderAtStatus(restaurantId, 'REFUNDED');
    }

    it('computes totals, per-item, and per-day breakdowns across DELIVERED orders only', async () => {
      const restaurant = await createApprovedRestaurant();
      await seedDeliveredOrders(restaurant._id.toString());

      const report = await ordersService.getSalesReport(
        owner,
        restaurant._id.toString(),
      );

      expect(report.currency).toBe('NGN');
      expect(report.totals.orders).toBe(3);
      expect(report.totals.revenue).toBe(45); // 20 + 15 + 10
      expect(report.totals.cogs).toBe(12); // (2*4) + 0 (missing) + (1*4)
      expect(report.totals.grossProfit).toBe(33);
      expect(report.totals.grossMarginPct).toBeCloseTo(73.33, 1);
      expect(report.totals.avgOrderValue).toBe(15);

      expect(report.itemsMissingCostPrice).toEqual(['Chicken']);

      const jollof = report.byItem.find((i) => i.name === 'Jollof Rice');
      expect(jollof).toMatchObject({
        qtySold: 3,
        revenue: 30,
        cogs: 12,
        profit: 18,
        hasIncompleteCostData: false,
      });
      const chicken = report.byItem.find((i) => i.name === 'Chicken');
      expect(chicken).toMatchObject({
        qtySold: 1,
        revenue: 15,
        cogs: 0, // missing cost price contributes 0, never treated as free-and-correct
        profit: 15,
        hasIncompleteCostData: true,
      });

      expect(report.byDay).toEqual([
        { date: '2026-01-01', orders: 2, revenue: 35, cogs: 8, profit: 27 },
        { date: '2026-01-02', orders: 1, revenue: 10, cogs: 4, profit: 6 },
      ]);
    });

    it('narrows to the given date range on deliveredAt', async () => {
      const restaurant = await createApprovedRestaurant();
      await seedDeliveredOrders(restaurant._id.toString());

      const report = await ordersService.getSalesReport(
        owner,
        restaurant._id.toString(),
        new Date('2026-01-02T00:00:00.000Z'),
        new Date('2026-01-02T23:59:59.999Z'),
      );

      expect(report.totals.orders).toBe(1);
      expect(report.totals.revenue).toBe(10);
      expect(report.byDay).toEqual([
        { date: '2026-01-02', orders: 1, revenue: 10, cogs: 4, profit: 6 },
      ]);
    });

    it('returns zeroed totals and empty breakdowns for a restaurant with no delivered orders', async () => {
      const restaurant = await createApprovedRestaurant();

      const report = await ordersService.getSalesReport(
        owner,
        restaurant._id.toString(),
      );

      expect(report.totals).toEqual({
        orders: 0,
        revenue: 0,
        deliveryFeeTotal: 0,
        serviceFeeTotal: 0,
        discountTotal: 0,
        platformFeeTotal: 0,
        netEarned: 0,
        totalCollected: 0,
        cogs: 0,
        grossProfit: 0,
        grossMarginPct: null,
        avgOrderValue: 0,
      });
      expect(report.itemsMissingCostPrice).toEqual([]);
      expect(report.byItem).toEqual([]);
      expect(report.byDay).toEqual([]);
    });

    it('rejects a caller who does not own the restaurant', async () => {
      const restaurant = await createApprovedRestaurant();
      const intruder = {
        sub: 'someone-else',
        email: 'intruder@test.local',
        role: 'restaurant_owner',
      } as const;

      await expect(
        ordersService.getSalesReport(intruder, restaurant._id.toString()),
      ).rejects.toThrow();
    });

    it('getSalesReportOrders returns only DELIVERED orders in range, oldest first, for CSV export', async () => {
      const restaurant = await createApprovedRestaurant();
      await seedDeliveredOrders(restaurant._id.toString());

      const orders = await ordersService.getSalesReportOrders(
        owner,
        restaurant._id.toString(),
      );

      expect(orders).toHaveLength(3);
      expect(orders.every((o) => o.status === 'DELIVERED')).toBe(true);
      expect(orders[0].deliveredAt!.getTime()).toBeLessThan(
        orders[1].deliveredAt!.getTime(),
      );
      expect(orders[1].deliveredAt!.getTime()).toBeLessThan(
        orders[2].deliveredAt!.getTime(),
      );
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

    it("findByPaymentRef still finds an order by an *earlier* reference after a retry issues a new one (docs/ROADMAP.md FDP-65) — previously overwriting paymentRef stranded a webhook for a session the customer actually completed before retrying", async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'PENDING_PAYMENT',
      );
      await ordersService.setPaymentRef(order, 'stripe', 'cs_test_first');
      const updated = await ordersService.setPaymentRef(
        order,
        'stripe',
        'cs_test_second',
      );

      expect(updated.paymentRef).toBe('cs_test_second'); // the current/latest ref
      expect(updated.paymentRefs).toEqual([
        'cs_test_first',
        'cs_test_second',
      ]);

      const foundFirst = await ordersService.findByPaymentRef('cs_test_first');
      expect(foundFirst?._id.toString()).toBe(order._id.toString());
      const foundSecond =
        await ordersService.findByPaymentRef('cs_test_second');
      expect(foundSecond?._id.toString()).toBe(order._id.toString());
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

    it("markPaidFromWebhook's atomic status filter means only one of two concurrent calls actually transitions the order (docs/ROADMAP.md FDP-65) — the scenario a non-atomic findById-then-save let race: webhook and the client's verifyPayment poll arriving within milliseconds of each other", async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'PENDING_PAYMENT',
      );

      const [first, second] = await Promise.all([
        ordersService.markPaidFromWebhook(order._id.toString()),
        ordersService.markPaidFromWebhook(order._id.toString()),
      ]);

      expect(first?.status).toBe('PLACED');
      expect(second?.status).toBe('PLACED');
      // Exactly one PLACED entry was ever pushed — not two — proving only one of the two calls
      // actually won the atomic transition.
      const finalOrder = await orderModel.findById(order._id).exec();
      expect(finalOrder?.statusHistory).toHaveLength(2); // PENDING_PAYMENT, PLACED
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

    it("markPaymentFailed never downgrades an already-refunded payment either (docs/ROADMAP.md FDP-65) — a late/duplicate 'failed' event for a refunded order previously slipped through and left status REFUNDED with paymentStatus 'failed', an inconsistent combination", async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );
      const claimed = await ordersService.claimForRefund(
        order._id.toString(),
      );
      await ordersService.finalizeRefund(order._id.toString());
      expect(claimed?.status).toBe('DELIVERED');

      const updated = await ordersService.markPaymentFailed(
        order._id.toString(),
      );
      expect(updated?.paymentStatus).toBe('refunded');
      expect(updated?.status).toBe('REFUNDED');
    });
  });

  describe('admin dispute/refund handling (FDP-20)', () => {
    it('adminFindOrThrow returns an order regardless of who owns it', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
      );

      const found = await ordersService.adminFindOrThrow(order._id.toString());
      expect(found._id.toString()).toBe(order._id.toString());
    });

    it('adminFindOrThrow throws NotFoundException for an unknown id', async () => {
      const restaurant = await createApprovedRestaurant();
      await expect(
        ordersService.adminFindOrThrow(restaurant._id.toString()),
      ).rejects.toThrow('Order not found');
    });

    it('claimForRefund + finalizeRefund transitions DELIVERED to REFUNDED, records history, and emits a realtime event', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );

      const claimed = await ordersService.claimForRefund(
        order._id.toString(),
      );
      expect(claimed?.status).toBe('DELIVERED'); // pre-update doc, for the caller to revert to

      const refunded = await ordersService.finalizeRefund(
        order._id.toString(),
      );
      expect(refunded.status).toBe('REFUNDED');
      expect(refunded.paymentStatus).toBe('refunded');
      expect(refunded.statusHistory.at(-1)).toMatchObject({
        status: 'REFUNDED',
        by: 'admin',
      });
      expect(realtimeGateway.emitOrderStatusChanged).toHaveBeenCalled();
    });

    it('claimForRefund also accepts a CANCELLED order with a succeeded payment (docs/ROADMAP.md FDP-65)', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'CANCELLED',
        { paymentStatus: 'succeeded' },
      );

      const claimed = await ordersService.claimForRefund(
        order._id.toString(),
      );
      expect(claimed?.status).toBe('CANCELLED');
      const updated = await orderModel.findById(order._id).exec();
      expect(updated?.status).toBe('REFUNDED');
    });

    it("claimForRefund's atomic status filter means only one of two concurrent refund attempts can claim the same order (docs/ROADMAP.md FDP-65)", async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );

      const [first, second] = await Promise.all([
        ordersService.claimForRefund(order._id.toString()),
        ordersService.claimForRefund(order._id.toString()),
      ]);

      const claims = [first, second].filter((c) => c !== null);
      expect(claims).toHaveLength(1); // exactly one of the two calls won the claim
    });

    it('claimForRefund returns null for an order whose payment never succeeded', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
      );
      await orderModel
        .updateOne({ _id: order._id }, { paymentStatus: 'failed' })
        .exec();

      const claimed = await ordersService.claimForRefund(
        order._id.toString(),
      );
      expect(claimed).toBeNull();
    });

    it("revertFailedRefundClaim puts a claimed order back to its previous status when the provider's refund call fails", async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );
      const claimed = await ordersService.claimForRefund(
        order._id.toString(),
      );
      expect(claimed?.status).toBe('DELIVERED');
      let current = await orderModel.findById(order._id).exec();
      expect(current?.status).toBe('REFUNDED'); // claimed

      await ordersService.revertFailedRefundClaim(
        order._id.toString(),
        'DELIVERED',
      );

      current = await orderModel.findById(order._id).exec();
      expect(current?.status).toBe('DELIVERED');
      expect(current?.paymentStatus).toBe('succeeded'); // unchanged — never actually refunded
    });

    it('revertFailedRefundClaim never overwrites a refund that genuinely completed in the meantime', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );
      await ordersService.claimForRefund(order._id.toString());
      await ordersService.finalizeRefund(order._id.toString());

      await ordersService.revertFailedRefundClaim(
        order._id.toString(),
        'DELIVERED',
      );

      const current = await orderModel.findById(order._id).exec();
      expect(current?.status).toBe('REFUNDED'); // untouched — paymentStatus was already 'refunded'
      expect(current?.paymentStatus).toBe('refunded');
    });

    it('getAnalyticsSummary counts orders by status and sums revenue by currency', async () => {
      const restaurantNgn = await createApprovedRestaurant('NGN');
      const restaurantUsd = await createApprovedRestaurant('USD');

      await orderModel.create({
        orderNumber: 'ORD-A1',
        customerId: userId,
        restaurantId: restaurantNgn._id,
        items: [],
        subtotal: 100,
        deliveryFee: 10,
        serviceFee: 5,
        tax: 0,
        discount: 0,
        total: 115,
        platformFeeAmount: 15,
        restaurantPayoutAmount: 85,
        currency: 'NGN',
        status: 'DELIVERED',
        statusHistory: [],
        paymentProvider: 'paystack',
        paymentStatus: 'succeeded',
        deliveryAddress: validAddress,
      });
      await orderModel.create({
        orderNumber: 'ORD-A2',
        customerId: userId,
        restaurantId: restaurantNgn._id,
        items: [],
        subtotal: 50,
        deliveryFee: 5,
        serviceFee: 2.5,
        tax: 0,
        discount: 0,
        total: 57.5,
        platformFeeAmount: 7.5,
        restaurantPayoutAmount: 42.5,
        currency: 'NGN',
        status: 'PLACED',
        statusHistory: [],
        paymentProvider: 'paystack',
        paymentStatus: 'succeeded',
        deliveryAddress: validAddress,
      });
      await orderModel.create({
        orderNumber: 'ORD-A3',
        customerId: userId,
        restaurantId: restaurantUsd._id,
        items: [],
        subtotal: 20,
        deliveryFee: 2,
        serviceFee: 1,
        tax: 0,
        discount: 0,
        total: 23,
        platformFeeAmount: 3,
        restaurantPayoutAmount: 17,
        currency: 'USD',
        status: 'PENDING_PAYMENT',
        statusHistory: [],
        paymentProvider: 'stripe',
        paymentStatus: 'pending', // not counted as revenue
        deliveryAddress: validAddress,
      });

      const summary = await ordersService.getAnalyticsSummary();
      expect(summary.totalOrders).toBe(3);
      expect(summary.ordersByStatus.DELIVERED).toBe(1);
      expect(summary.ordersByStatus.PLACED).toBe(1);
      expect(summary.ordersByStatus.PENDING_PAYMENT).toBe(1);
      expect(summary.ordersByStatus.CANCELLED).toBe(0);
      expect(summary.revenueByCurrency).toEqual({ NGN: 172.5 });
    });
  });

  describe('rider dispatch (FDP-16)', () => {
    const riderA = 'rider-a-id';
    const riderB = 'rider-b-id';

    it('findUnassignedForRiders returns only unassigned READY_FOR_PICKUP orders, oldest first', async () => {
      const restaurant = await createApprovedRestaurant();
      const ready1 = await createOrderAtStatus(
        restaurant._id.toString(),
        'READY_FOR_PICKUP',
      );
      await createOrderAtStatus(restaurant._id.toString(), 'PREPARING'); // not ready yet
      const assigned = await createOrderAtStatus(
        restaurant._id.toString(),
        'READY_FOR_PICKUP',
      );
      await orderModel
        .updateOne({ _id: assigned._id }, { riderId: riderA })
        .exec(); // already claimed — shouldn't show up
      const ready2 = await createOrderAtStatus(
        restaurant._id.toString(),
        'READY_FOR_PICKUP',
      );

      const queue = await ordersService.findUnassignedForRiders();
      expect(queue.map((o) => o._id.toString())).toEqual([
        ready1._id.toString(),
        ready2._id.toString(),
      ]);
    });

    it('assignToRider claims an unassigned order, transitions it, and emits a realtime event', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'READY_FOR_PICKUP',
      );

      const claimed = await ordersService.assignToRider(
        riderA,
        order._id.toString(),
      );

      expect(claimed.riderId?.toString()).toBe(riderA);
      expect(claimed.status).toBe('ASSIGNED_TO_RIDER');
      expect(claimed.statusHistory.at(-1)).toMatchObject({
        status: 'ASSIGNED_TO_RIDER',
        by: riderA,
      });
      expect(realtimeGateway.emitOrderStatusChanged).toHaveBeenCalled();
    });

    it('assignToRider rejects a second rider claiming an already-assigned order', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'READY_FOR_PICKUP',
      );

      await ordersService.assignToRider(riderA, order._id.toString());

      await expect(
        ordersService.assignToRider(riderB, order._id.toString()),
      ).rejects.toThrow(BadRequestException);

      // The failed second claim must not have disturbed rider A's assignment.
      const stillMine = await ordersService.findForRider(riderA);
      expect(
        stillMine.find((o) => o._id.toString() === order._id.toString()),
      ).toBeDefined();
    });

    it('assignToRider rejects an order that is not READY_FOR_PICKUP', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'PREPARING',
      );

      await expect(
        ordersService.assignToRider(riderA, order._id.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('assignToRider throws NotFoundException for an unknown order id', async () => {
      const restaurant = await createApprovedRestaurant();
      const missingId = restaurant._id.toString();
      await expect(
        ordersService.assignToRider(riderA, missingId),
      ).rejects.toThrow('Order not found');
    });

    describe('updateStatusByRider', () => {
      it('walks ASSIGNED_TO_RIDER → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED for the assigned rider', async () => {
        const restaurant = await createApprovedRestaurant();
        const order = await createOrderAtStatus(
          restaurant._id.toString(),
          'ASSIGNED_TO_RIDER',
        );
        await orderModel
          .updateOne({ _id: order._id }, { riderId: riderA })
          .exec();

        const pickedUp = await ordersService.updateStatusByRider(
          riderA,
          order._id.toString(),
          'PICKED_UP',
        );
        expect(pickedUp.status).toBe('PICKED_UP');

        const outForDelivery = await ordersService.updateStatusByRider(
          riderA,
          order._id.toString(),
          'OUT_FOR_DELIVERY',
        );
        expect(outForDelivery.status).toBe('OUT_FOR_DELIVERY');

        const delivered = await ordersService.updateStatusByRider(
          riderA,
          order._id.toString(),
          'DELIVERED',
        );
        expect(delivered.status).toBe('DELIVERED');
        expect(delivered.statusHistory).toHaveLength(4); // seeded + 3 transitions
        // Sales-report date-range filtering (docs/ROADMAP.md FDP-64) relies on this being set.
        expect(delivered.deliveredAt).toBeInstanceOf(Date);
      });

      it('rejects a rider who is not assigned to the order', async () => {
        const restaurant = await createApprovedRestaurant();
        const order = await createOrderAtStatus(
          restaurant._id.toString(),
          'ASSIGNED_TO_RIDER',
        );
        await orderModel
          .updateOne({ _id: order._id }, { riderId: riderA })
          .exec();

        await expect(
          ordersService.updateStatusByRider(
            riderB,
            order._id.toString(),
            'PICKED_UP',
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects a transition not allowed by the rider state machine', async () => {
        const restaurant = await createApprovedRestaurant();
        const order = await createOrderAtStatus(
          restaurant._id.toString(),
          'ASSIGNED_TO_RIDER',
        );
        await orderModel
          .updateOne({ _id: order._id }, { riderId: riderA })
          .exec();

        await expect(
          ordersService.updateStatusByRider(
            riderA,
            order._id.toString(),
            'DELIVERED', // skipping PICKED_UP/OUT_FOR_DELIVERY
          ),
        ).rejects.toThrow(BadRequestException);
      });
    });

    it("findForRider returns only that rider's orders, newest first", async () => {
      const restaurant = await createApprovedRestaurant();
      const first = await createOrderAtStatus(
        restaurant._id.toString(),
        'ASSIGNED_TO_RIDER',
      );
      await orderModel
        .updateOne({ _id: first._id }, { riderId: riderA })
        .exec();
      const second = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
      );
      await orderModel
        .updateOne({ _id: second._id }, { riderId: riderA })
        .exec();
      const someoneElses = await createOrderAtStatus(
        restaurant._id.toString(),
        'ASSIGNED_TO_RIDER',
      );
      await orderModel
        .updateOne({ _id: someoneElses._id }, { riderId: riderB })
        .exec();

      const mine = await ordersService.findForRider(riderA);
      expect(mine.map((o) => o._id.toString())).toEqual([
        second._id.toString(),
        first._id.toString(),
      ]);
    });
  });
});
