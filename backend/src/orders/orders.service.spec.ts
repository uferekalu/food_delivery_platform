import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { OrdersService } from './orders.service';
import { CartService } from '../cart/cart.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StoresService } from '../stores/stores.service';
import { PromoCodesService } from '../promo-codes/promo-codes.service';
import { PaymentProviderResolver } from '../payments/provider-resolver';
import { TaxResolver } from './tax-resolver';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { BusinessVerificationService } from '../business-verification/business-verification.service';
import {
  PayoutClawback,
  PayoutClawbackDocument,
  PayoutClawbackSchema,
} from '../payouts/schemas/payout-clawback.schema';
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
  Store,
  StoreDocument,
  StoreSchema,
} from '../stores/schemas/store.schema';
import {
  Product,
  ProductDocument,
  ProductSchema,
} from '../stores/schemas/product.schema';
import {
  PromoCode,
  PromoCodeSchema,
} from '../promo-codes/schemas/promo-code.schema';
import {
  Rider,
  RiderDocument,
  RiderSchema,
} from '../riders/schemas/rider.schema';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';

jest.setTimeout(30_000);

// promoCodesService.create() requires a requester as of docs/ROADMAP.md FDP-111 (vendor-created
// promo codes) — every promo fixture in this file is platform-wide, so an admin requester here.
const promoAdmin: AccessTokenPayload = {
  sub: 'promo-admin-id',
  email: 'promo-admin@example.com',
  role: 'admin',
};

describe('OrdersService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let ordersService: OrdersService;
  let cartService: CartService;
  let restaurantsService: RestaurantsService;
  let storesService: StoresService;
  let promoCodesService: PromoCodesService;
  let deliveryZonesService: DeliveryZonesService;
  let realtimeGateway: { emitOrderStatusChanged: jest.Mock };
  let restaurantModel: Model<RestaurantDocument>;
  let itemModel: Model<MenuItemDocument>;
  let storeModel: Model<StoreDocument>;
  let productModel: Model<ProductDocument>;
  let cartModel: Model<CartDocument>;
  let orderModel: Model<OrderDocument>;
  let zoneModel: Model<DeliveryZoneDocument>;
  let riderModel: Model<RiderDocument>;
  let payoutClawbackModel: Model<PayoutClawbackDocument>;
  let notify: jest.Mock;
  let listAll: jest.Mock;

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
          { name: Store.name, schema: StoreSchema },
          { name: Product.name, schema: ProductSchema },
          { name: PromoCode.name, schema: PromoCodeSchema },
          { name: DeliveryZone.name, schema: DeliveryZoneSchema },
          { name: Rider.name, schema: RiderSchema },
          { name: PayoutClawback.name, schema: PayoutClawbackSchema },
        ]),
      ],
      providers: [
        OrdersService,
        CartService,
        RestaurantsService,
        StoresService,
        PromoCodesService,
        PaymentProviderResolver,
        TaxResolver,
        DeliveryZonesService,
        {
          provide: RealtimeGateway,
          useValue: { emitOrderStatusChanged: jest.fn() },
        },
        {
          // Not exercised by this suite (docs/ROADMAP.md FDP-115) — a bare no-op mock, same
          // reasoning as every other RestaurantsService/StoresService consumer's spec file.
          provide: BusinessVerificationService,
          useValue: {
            verifyBusinessRegistration: jest.fn().mockResolvedValue({
              outcome: 'unknown',
              reason: 'not configured',
            }),
          },
        },
        {
          // Notification delivery (FDP-19) is fire-and-forget from OrdersService — a resolved
          // mock is enough to keep it from surfacing as an unhandled rejection in these tests.
          provide: NotificationsService,
          useValue: { notify: jest.fn().mockResolvedValue(undefined) },
        },
        {
          // Admin fan-out for the refund-hardening pass (docs/ROADMAP.md FDP-104) — no admins by
          // default, individual tests override this where they need to assert on it.
          provide: UsersService,
          useValue: {
            listAll: jest.fn().mockResolvedValue({
              items: [],
              total: 0,
              page: 1,
              limit: 50,
              totalPages: 0,
            }),
          },
        },
      ],
    }).compile();

    ordersService = moduleRef.get(OrdersService);
    cartService = moduleRef.get(CartService);
    restaurantsService = moduleRef.get(RestaurantsService);
    storesService = moduleRef.get(StoresService);
    promoCodesService = moduleRef.get(PromoCodesService);
    deliveryZonesService = moduleRef.get(DeliveryZonesService);
    realtimeGateway = moduleRef.get(RealtimeGateway);
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    itemModel = moduleRef.get(getModelToken(MenuItem.name));
    storeModel = moduleRef.get(getModelToken(Store.name));
    productModel = moduleRef.get(getModelToken(Product.name));
    cartModel = moduleRef.get(getModelToken(Cart.name));
    orderModel = moduleRef.get(getModelToken(Order.name));
    zoneModel = moduleRef.get(getModelToken(DeliveryZone.name));
    riderModel = moduleRef.get(getModelToken(Rider.name));
    payoutClawbackModel = moduleRef.get(getModelToken(PayoutClawback.name));
    notify = moduleRef.get(NotificationsService).notify as jest.Mock;
    listAll = moduleRef.get(UsersService).listAll as jest.Mock;
    // $geoNear (nearest-rider dispatch, docs/ROADMAP.md FDP-98) needs the 2dsphere index built
    // before the first geo query — see backend/CLAUDE.md/docs/ARCHITECTURE.md §22 for why this
    // can't be assumed ready right after `MongooseModule.forFeature` resolves.
    await riderModel.init();
  }, 60_000);

  afterEach(async () => {
    // Without this, `realtimeGateway.emitOrderStatusChanged`'s call count accumulates across
    // every test in this file (it's the same mock instance for the whole `describe` block, set
    // up once in `beforeAll`) — a test asserting an exact `toHaveBeenCalledTimes` count would
    // otherwise silently depend on how many other tests ran before it in file order.
    realtimeGateway.emitOrderStatusChanged.mockClear();
    notify.mockClear();
    listAll.mockClear();
    await Promise.all([
      restaurantModel.deleteMany({}).exec(),
      itemModel.deleteMany({}).exec(),
      storeModel.deleteMany({}).exec(),
      productModel.deleteMany({}).exec(),
      cartModel.deleteMany({}).exec(),
      orderModel.deleteMany({}).exec(),
      zoneModel.deleteMany({}).exec(),
      riderModel.deleteMany({}).exec(),
      payoutClawbackModel.deleteMany({}).exec(),
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
      businessRegistrationNumber: 'RC1234567',
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
    expect(order.tax).toBe(17.25); // NGN's 7.5% VAT rate on (200 + 20 + 10 - 0)
    expect(order.discount).toBe(0);
    expect(order.total).toBe(247.25);
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

  describe('store orders (FDP-56)', () => {
    const owner = {
      sub: 'store-owner-id',
      email: 'store-owner@test.local',
      role: 'restaurant_owner',
    } as const;

    async function createApprovedStore() {
      const store = await storesService.create(owner.sub, {
        name: 'Market Square Supermarket',
        type: 'groceries',
        currency: 'NGN',
        country: 'Nigeria',
        address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
        complianceDocumentUrl: 'https://example.com/doc.pdf',
        businessRegistrationNumber: 'RC1234567',
      });
      return storesService.approve(store._id.toString());
    }

    async function createTestProduct(
      storeId: string,
      overrides: Partial<{
        price: number;
        isAvailable: boolean;
        stockQuantity: number | null;
      }> = {},
    ) {
      return productModel.create({
        storeId,
        categoryId: storeId,
        name: 'Milk',
        price: overrides.price ?? 10,
        isAvailable: overrides.isAvailable ?? true,
        stockQuantity: overrides.stockQuantity ?? null,
      });
    }

    it('creates a store order in PENDING_PAYMENT, computes fees the same way a restaurant order does, and clears the cart', async () => {
      const store = await createApprovedStore();
      const product = await createTestProduct(store._id.toString(), {
        price: 100,
      });
      await cartService.addStoreItem(userId, {
        productId: product._id.toString(),
        qty: 2,
      }); // subtotal 200

      const order = await ordersService.createOrder(userId, {
        deliveryAddress: validAddress,
      });

      expect(order.sellerType).toBe('store');
      expect(order.storeId?.toString()).toBe(store._id.toString());
      expect(order.restaurantId).toBeNull();
      expect(order.status).toBe('PENDING_PAYMENT');
      expect(order.subtotal).toBe(200);
      expect(order.deliveryFee).toBe(20); // same FALLBACK_DELIVERY_FEE_RATE as a zone-less restaurant
      expect(order.serviceFee).toBe(10);
      expect(order.tax).toBe(17.25); // NGN's 7.5% VAT rate on (200 + 20 + 10 - 0)
      expect(order.total).toBe(247.25);
      expect(order.platformFeeAmount).toBe(30);
      expect(order.restaurantPayoutAmount).toBe(170);
      expect(order.currency).toBe('NGN');
      expect(order.items).toHaveLength(1);
      expect(order.items[0].productId?.toString()).toBe(product._id.toString());

      const cartAfter = await cartService.getCart(userId);
      expect(cartAfter.items).toHaveLength(0);
    });

    it('rejects an unknown promo code on a store order', async () => {
      const store = await createApprovedStore();
      const product = await createTestProduct(store._id.toString());
      await cartService.addStoreItem(userId, {
        productId: product._id.toString(),
      });

      await expect(
        ordersService.createOrder(userId, {
          deliveryAddress: validAddress,
          promoCode: 'SAVE10',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('applies a valid store-scoped promo code to a store order and redeems it (docs/ROADMAP.md FDP-90)', async () => {
      const store = await createApprovedStore();
      const product = await createTestProduct(store._id.toString(), {
        price: 100,
      });
      await cartService.addStoreItem(userId, {
        productId: product._id.toString(),
        qty: 2,
      }); // subtotal 200
      const promo = await promoCodesService.create(
        {
          code: 'STORE10',
          discountType: 'percentage',
          discountValue: 10,
          storeId: store._id.toString(),
        },
        promoAdmin,
      );

      const order = await ordersService.createOrder(userId, {
        deliveryAddress: validAddress,
        promoCode: 'STORE10',
      });

      expect(order.discount).toBe(20); // 10% of 200
      expect(order.promoCode).toBe('STORE10');
      expect(order.tax).toBe(15.75); // NGN's 7.5% VAT rate on (200 + 20 + 10 - 20 discount)
      expect(order.total).toBe(225.75); // 200 + 20 deliveryFee + 10 serviceFee + 15.75 tax - 20 discount

      const updatedPromo = await promoCodesService.findAll();
      expect(
        updatedPromo.find((p) => p._id.toString() === promo._id.toString())
          ?.usedCount,
      ).toBe(1);
    });

    it('rejects a promo code scoped to a different store', async () => {
      const store = await createApprovedStore();
      const otherStore = await createApprovedStore();
      const product = await createTestProduct(store._id.toString());
      await cartService.addStoreItem(userId, {
        productId: product._id.toString(),
      });
      await promoCodesService.create(
        {
          code: 'OTHERSTORE',
          discountType: 'fixed',
          discountValue: 5,
          storeId: otherStore._id.toString(),
        },
        promoAdmin,
      );

      await expect(
        ordersService.createOrder(userId, {
          deliveryAddress: validAddress,
          promoCode: 'OTHERSTORE',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses real zone-based delivery pricing for a store order, the same way a restaurant order does (docs/ROADMAP.md FDP-90)', async () => {
      const store = await createApprovedStore();
      await storeModel
        .updateOne(
          { _id: store._id },
          {
            address: {
              line1: '1 Main St',
              city: 'Lagos',
              state: 'Lagos',
              lat: 6.5,
              lng: 3.3792,
            },
          },
        )
        .exec();
      await deliveryZonesService.create('store', store._id.toString(), owner, {
        name: 'Nearby',
        maxDistanceKm: 20,
        baseFee: 300,
        perKmFee: 50,
      });
      const product = await createTestProduct(store._id.toString(), {
        price: 100,
      });
      await cartService.addStoreItem(userId, {
        productId: product._id.toString(),
      });

      const order = await ordersService.createOrder(userId, {
        deliveryAddress: {
          line1: '2 Second St',
          city: 'Lagos',
          state: 'Lagos',
          lat: 6.545, // ~5km away
          lng: 3.3792,
        },
      });

      expect(order.deliveryFee).toBeGreaterThan(300);
      expect(order.deliveryFee).not.toBe(10); // not the flat 10% fallback
    });

    it('rejects checkout when a tracked product no longer has enough stock', async () => {
      const store = await createApprovedStore();
      const product = await createTestProduct(store._id.toString(), {
        stockQuantity: 1,
      });
      await cartService.addStoreItem(userId, {
        productId: product._id.toString(),
        qty: 1,
      });
      // Stock drops below what's in the cart between add-to-cart and checkout.
      await productModel
        .updateOne({ _id: product._id }, { stockQuantity: 0 })
        .exec();

      await expect(
        ordersService.createOrder(userId, {
          deliveryAddress: validAddress,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("findForStore returns only that store's active orders, and rejects a non-owner", async () => {
      const store = await createApprovedStore();
      const product = await createTestProduct(store._id.toString());
      await cartService.addStoreItem(userId, {
        productId: product._id.toString(),
      });
      await ordersService.createOrder(userId, {
        deliveryAddress: validAddress,
      });

      const stranger = {
        sub: 'stranger-id',
        email: 'stranger@test.local',
        role: 'restaurant_owner',
      } as const;
      await expect(
        ordersService.findForStore(stranger, store._id.toString()),
      ).rejects.toThrow(ForbiddenException);

      // PENDING_PAYMENT is not an "active seller" status yet (same as a restaurant order) —
      // the queue is empty until a webhook moves it to PLACED.
      const queue = await ordersService.findForStore(
        owner,
        store._id.toString(),
      );
      expect(queue).toHaveLength(0);
    });

    it('updateStatusByOwner dispatches to the store-owner ownership check for a store order', async () => {
      const store = await createApprovedStore();
      const product = await createTestProduct(store._id.toString());
      await cartService.addStoreItem(userId, {
        productId: product._id.toString(),
      });
      const order = await ordersService.createOrder(userId, {
        deliveryAddress: validAddress,
      });
      await orderModel
        .updateOne({ _id: order._id }, { status: 'PLACED' })
        .exec();

      const stranger = {
        sub: 'stranger-id',
        email: 'stranger@test.local',
        role: 'restaurant_owner',
      } as const;
      await expect(
        ordersService.updateStatusByOwner(
          stranger,
          order._id.toString(),
          'ACCEPTED_BY_RESTAURANT',
        ),
      ).rejects.toThrow(ForbiddenException);

      const updated = await ordersService.updateStatusByOwner(
        owner,
        order._id.toString(),
        'ACCEPTED_BY_RESTAURANT',
      );
      expect(updated.status).toBe('ACCEPTED_BY_RESTAURANT');
      expect(realtimeGateway.emitOrderStatusChanged).toHaveBeenCalled();
    });
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
      await deliveryZonesService.create(
        'restaurant',
        restaurant._id.toString(),
        owner,
        {
          name: 'Nearby',
          maxDistanceKm: 20,
          baseFee: 300,
          perKmFee: 50,
        },
      );
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
      await deliveryZonesService.create(
        'restaurant',
        restaurant._id.toString(),
        owner,
        {
          name: 'Nearby only',
          maxDistanceKm: 1,
          baseFee: 300,
          perKmFee: 50,
        },
      );
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
      await deliveryZonesService.create(
        'restaurant',
        restaurant._id.toString(),
        owner,
        {
          name: 'Nearby',
          maxDistanceKm: 20,
          baseFee: 300,
          perKmFee: 50,
        },
      );
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
    const promo = await promoCodesService.create(
      {
        code: 'SAVE10',
        discountType: 'fixed',
        discountValue: 10,
      },
      promoAdmin,
    );

    const order = await ordersService.createOrder(userId, {
      deliveryAddress: validAddress,
      promoCode: 'SAVE10',
    });

    expect(order.discount).toBe(10);
    expect(order.promoCode).toBe('SAVE10');
    expect(order.tax).toBeGreaterThan(0); // NGN has a nonzero VAT rate — confirms it's not silently 0
    expect(order.total).toBe(
      order.subtotal + order.deliveryFee + order.serviceFee + order.tax - 10,
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
        'restaurant',
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
        'restaurant',
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
        ordersService.getEarningsSummary(
          intruder,
          'restaurant',
          restaurant._id.toString(),
        ),
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
        'restaurant',
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
      // Zero here only because seedDeliveredOrders' orders all have tax: 0 — see the dedicated
      // getSalesReportTransactions tests below for a non-zero tax figure.
      expect(report.totals.taxTotal).toBe(0);
    });

    it('narrows to the given date range on deliveredAt', async () => {
      const restaurant = await createApprovedRestaurant();
      await seedDeliveredOrders(restaurant._id.toString());

      const report = await ordersService.getSalesReport(
        owner,
        'restaurant',
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
        'restaurant',
        restaurant._id.toString(),
      );

      expect(report.totals).toEqual({
        orders: 0,
        revenue: 0,
        deliveryFeeTotal: 0,
        serviceFeeTotal: 0,
        taxTotal: 0,
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
        ordersService.getSalesReport(
          intruder,
          'restaurant',
          restaurant._id.toString(),
        ),
      ).rejects.toThrow();
    });

    it('getSalesReportOrders returns only DELIVERED orders in range, oldest first, for CSV export', async () => {
      const restaurant = await createApprovedRestaurant();
      await seedDeliveredOrders(restaurant._id.toString());

      const orders = await ordersService.getSalesReportOrders(
        owner,
        'restaurant',
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

  describe('getSalesReportTransactions (docs/ROADMAP.md FDP-129)', () => {
    const owner = {
      sub: 'owner-id',
      email: 'owner@test.local',
      role: 'restaurant_owner',
    } as const;

    it('returns paginated DELIVERED orders for the seller with a full per-order fee breakdown', async () => {
      const restaurant = await createApprovedRestaurant('NGN');
      await orderModel.create({
        orderNumber: 'ORD-VTX1',
        customerId: userId,
        sellerType: 'restaurant',
        restaurantId: restaurant._id.toString(),
        items: [{ name: 'Jollof Rice', price: 100, qty: 2 }],
        subtotal: 200,
        deliveryFee: 20,
        serviceFee: 10,
        tax: 17.25,
        discount: 0,
        total: 247.25,
        platformFeeAmount: 30,
        restaurantPayoutAmount: 170,
        currency: 'NGN',
        status: 'DELIVERED',
        statusHistory: [],
        paymentProvider: 'paystack',
        paymentStatus: 'succeeded',
        deliveryAddress: validAddress,
        deliveredAt: new Date(),
      });
      // Not DELIVERED — must never appear in this list, same convention as getSalesReportOrders.
      await orderModel.create({
        orderNumber: 'ORD-VTX2',
        customerId: userId,
        sellerType: 'restaurant',
        restaurantId: restaurant._id.toString(),
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
        status: 'PLACED',
        statusHistory: [],
        paymentProvider: 'paystack',
        paymentStatus: 'succeeded',
        deliveryAddress: validAddress,
      });

      const result = await ordersService.getSalesReportTransactions(
        owner,
        'restaurant',
        restaurant._id.toString(),
        undefined,
        undefined,
        1,
        20,
      );

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      const tx = result.items[0];
      expect(tx.orderNumber).toBe('ORD-VTX1');
      expect(tx.vendor).toEqual({
        type: 'restaurant',
        id: restaurant._id.toString(),
        name: 'Burgundy Kitchen',
      });
      expect(tx.subtotal).toBe(200);
      expect(tx.deliveryFee).toBe(20);
      expect(tx.serviceFee).toBe(10);
      expect(tx.tax).toBe(17.25);
      expect(tx.discount).toBe(0);
      expect(tx.total).toBe(247.25);
      expect(tx.platformFeeAmount).toBe(30);
      expect(tx.payoutAmount).toBe(170);
      // Derived from THIS order's own stored amounts, not the platform's current global rate —
      // see OrderTransaction's doc comment. 30/200*100, 10/200*100, 17.25/230*100 (taxable base
      // = subtotal + deliveryFee + serviceFee - discount = 230), 20/247.25*100.
      expect(tx.platformFeeRatePct).toBe(15);
      expect(tx.serviceFeeRatePct).toBe(5);
      expect(tx.taxRatePct).toBe(7.5);
      expect(tx.deliveryFeeSharePct).toBeCloseTo(8.09, 1);
    });

    it("computes *RatePct fields from the order's own amounts, not today's global rate — a historical order keeps its original rate even if the constants change later", async () => {
      const restaurant = await createApprovedRestaurant('NGN');
      // platformFeeAmount is 10% of subtotal here, not the current 15% PLATFORM_COMMISSION_RATE —
      // simulating an order placed under a since-changed rate.
      await orderModel.create({
        orderNumber: 'ORD-HIST1',
        customerId: userId,
        sellerType: 'restaurant',
        restaurantId: restaurant._id.toString(),
        items: [],
        subtotal: 1000,
        deliveryFee: 50,
        serviceFee: 30,
        tax: 0,
        discount: 0,
        total: 1080,
        platformFeeAmount: 100,
        restaurantPayoutAmount: 900,
        currency: 'NGN',
        status: 'DELIVERED',
        statusHistory: [],
        paymentProvider: 'paystack',
        paymentStatus: 'succeeded',
        deliveryAddress: validAddress,
        deliveredAt: new Date(),
      });

      const result = await ordersService.getSalesReportTransactions(
        owner,
        'restaurant',
        restaurant._id.toString(),
        undefined,
        undefined,
        1,
        20,
      );

      expect(result.items[0].platformFeeRatePct).toBe(10);
    });

    it('narrows to the given date range on deliveredAt, same as getSalesReportOrders', async () => {
      const restaurant = await createApprovedRestaurant('NGN');
      await orderModel.create({
        orderNumber: 'ORD-VTX-IN-RANGE',
        customerId: userId,
        sellerType: 'restaurant',
        restaurantId: restaurant._id.toString(),
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
        deliveredAt: new Date('2026-01-02T10:00:00.000Z'),
      });
      await orderModel.create({
        orderNumber: 'ORD-VTX-OUT-OF-RANGE',
        customerId: userId,
        sellerType: 'restaurant',
        restaurantId: restaurant._id.toString(),
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
        deliveredAt: new Date('2026-01-05T10:00:00.000Z'),
      });

      const result = await ordersService.getSalesReportTransactions(
        owner,
        'restaurant',
        restaurant._id.toString(),
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-01-02T23:59:59.999Z'),
        1,
        20,
      );

      expect(result.items.map((t) => t.orderNumber)).toEqual([
        'ORD-VTX-IN-RANGE',
      ]);
    });

    it('paginates', async () => {
      const restaurant = await createApprovedRestaurant('NGN');
      for (let i = 0; i < 3; i++) {
        await orderModel.create({
          orderNumber: `ORD-VTX-PAGE-${i}`,
          customerId: userId,
          sellerType: 'restaurant',
          restaurantId: restaurant._id.toString(),
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
          deliveredAt: new Date(),
        });
      }

      const result = await ordersService.getSalesReportTransactions(
        owner,
        'restaurant',
        restaurant._id.toString(),
        undefined,
        undefined,
        1,
        2,
      );

      expect(result.total).toBe(3);
      expect(result.totalPages).toBe(2);
      expect(result.items).toHaveLength(2);
    });

    it('rejects a requester who does not own the restaurant', async () => {
      const restaurant = await createApprovedRestaurant('NGN');
      const intruder = {
        sub: 'someone-else',
        email: 'intruder@test.local',
        role: 'restaurant_owner',
      } as const;

      await expect(
        ordersService.getSalesReportTransactions(
          intruder,
          'restaurant',
          restaurant._id.toString(),
          undefined,
          undefined,
          1,
          20,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getFeeSchedule (docs/ROADMAP.md FDP-129)', () => {
    it('returns the current platform commission, service fee, and per-currency tax rates as percentages', () => {
      const schedule = ordersService.getFeeSchedule();

      expect(schedule.platformCommissionRatePct).toBe(15);
      expect(schedule.serviceFeeRatePct).toBe(5);
      expect(schedule.taxRatesByCurrency).toEqual({
        NGN: 7.5,
        GHS: 15,
        KES: 16,
        ZAR: 15,
        UGX: 18,
        GBP: 20,
      });
      // USD/EUR deliberately absent — TaxResolver/TAX_RATE_TABLE's own doc comment explains why
      // (no single accurate national rate for either).
      expect(schedule.taxRatesByCurrency.USD).toBeUndefined();
    });
  });

  describe('store earnings/sales-report (docs/ROADMAP.md FDP-102)', () => {
    const owner = {
      sub: 'owner-id',
      email: 'owner@test.local',
      role: 'restaurant_owner',
    } as const;

    async function createApprovedStore() {
      const store = await storesService.create(owner.sub, {
        name: 'Market Square Supermarket',
        type: 'groceries',
        currency: 'NGN',
        country: 'Nigeria',
        address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
        complianceDocumentUrl: 'https://example.com/doc.pdf',
        businessRegistrationNumber: 'RC1234567',
      });
      return storesService.approve(store._id.toString());
    }

    async function createStoreOrderAtStatus(
      storeId: string,
      status: OrderStatus,
    ) {
      return orderModel.create({
        orderNumber: `ORD-TEST-${Math.random().toString(36).slice(2, 8)}`,
        customerId: userId,
        sellerType: 'store',
        restaurantId: null,
        storeId,
        items: [
          {
            productId: storeId,
            name: 'Milk',
            price: 10,
            costPrice: null,
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
        platformFeeAmount: 1.5,
        restaurantPayoutAmount: 8.5,
        currency: 'NGN',
        status,
        statusHistory: [{ status, at: new Date(), by: userId }],
        deliveredAt: status === 'DELIVERED' ? new Date() : null,
        paymentProvider: 'paystack',
        paymentStatus: 'pending',
        deliveryAddress: validAddress,
      });
    }

    it('getEarningsSummary sums a store’s DELIVERED orders only, scoped by storeId not restaurantId', async () => {
      const store = await createApprovedStore();
      await createStoreOrderAtStatus(store._id.toString(), 'DELIVERED');
      await createStoreOrderAtStatus(store._id.toString(), 'DELIVERED');
      await createStoreOrderAtStatus(store._id.toString(), 'PLACED');

      const summary = await ordersService.getEarningsSummary(
        owner,
        'store',
        store._id.toString(),
      );

      expect(summary.deliveredOrders).toBe(2);
      expect(summary.grossRevenue).toBe(20);
      expect(summary.netEarned).toBe(17);
      expect(summary.currency).toBe('NGN');
    });

    it('getSalesReport computes totals for a store the same way as a restaurant', async () => {
      const store = await createApprovedStore();
      await createStoreOrderAtStatus(store._id.toString(), 'DELIVERED');
      await createStoreOrderAtStatus(store._id.toString(), 'DELIVERED');

      const report = await ordersService.getSalesReport(
        owner,
        'store',
        store._id.toString(),
      );

      expect(report.currency).toBe('NGN');
      expect(report.totals.orders).toBe(2);
      expect(report.totals.revenue).toBe(20);
    });

    it('getSalesReportOrders returns only that store’s DELIVERED orders', async () => {
      const store = await createApprovedStore();
      const otherStore = await createApprovedStore();
      await createStoreOrderAtStatus(store._id.toString(), 'DELIVERED');
      await createStoreOrderAtStatus(otherStore._id.toString(), 'DELIVERED');

      const orders = await ordersService.getSalesReportOrders(
        owner,
        'store',
        store._id.toString(),
      );

      expect(orders).toHaveLength(1);
      expect(orders[0].storeId?.toString()).toBe(store._id.toString());
    });

    it('rejects a caller who does not own the store, for all three methods', async () => {
      const store = await createApprovedStore();
      const intruder = {
        sub: 'someone-else',
        email: 'intruder@test.local',
        role: 'restaurant_owner',
      } as const;

      await expect(
        ordersService.getEarningsSummary(
          intruder,
          'store',
          store._id.toString(),
        ),
      ).rejects.toThrow();
      await expect(
        ordersService.getSalesReport(intruder, 'store', store._id.toString()),
      ).rejects.toThrow();
      await expect(
        ordersService.getSalesReportOrders(
          intruder,
          'store',
          store._id.toString(),
        ),
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
      expect(updated.settledViaInstantSplit).toBe(false); // default when omitted
    });

    it("setPaymentRef records settledViaInstantSplit when passed, and overwrites it on a later attempt rather than accumulating (docs/ROADMAP.md FDP-92) — mirrors paymentProvider's own 'latest attempt wins' semantics", async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'PENDING_PAYMENT',
      );

      const first = await ordersService.setPaymentRef(
        order,
        'stripe',
        'cs_test_split',
        true,
      );
      expect(first.settledViaInstantSplit).toBe(true);

      const second = await ordersService.setPaymentRef(
        order,
        'stripe',
        'cs_test_no_split',
        false,
      );
      expect(second.settledViaInstantSplit).toBe(false);
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

    it('findByPaymentRef still finds an order by an *earlier* reference after a retry issues a new one (docs/ROADMAP.md FDP-65) — previously overwriting paymentRef stranded a webhook for a session the customer actually completed before retrying', async () => {
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
      expect(updated.paymentRefs).toEqual(['cs_test_first', 'cs_test_second']);

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
      const claimed = await ordersService.claimForRefund(order._id.toString());
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

      const claimed = await ordersService.claimForRefund(order._id.toString());
      expect(claimed?.status).toBe('DELIVERED'); // pre-update doc, for the caller to revert to

      const refunded = await ordersService.finalizeRefund(order._id.toString());
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

      const claimed = await ordersService.claimForRefund(order._id.toString());
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

      const claimed = await ordersService.claimForRefund(order._id.toString());
      expect(claimed).toBeNull();
    });

    it("revertFailedRefundClaim puts a claimed order back to its previous status when the provider's refund call fails", async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );
      const claimed = await ordersService.claimForRefund(order._id.toString());
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
  });

  describe('refund clawback (docs/ROADMAP.md FDP-104)', () => {
    it('finalizeRefund creates a PayoutClawback when the order had already been paid out to the vendor', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );
      await orderModel
        .updateOne({ _id: order._id }, { vendorPayoutId: 'old-payout-id' })
        .exec();

      await ordersService.claimForRefund(order._id.toString());
      await ordersService.finalizeRefund(order._id.toString());

      const clawbacks = await payoutClawbackModel
        .find({ orderId: order._id.toString() })
        .exec();
      expect(clawbacks).toHaveLength(1);
      expect(clawbacks[0]).toMatchObject({
        vendorType: 'restaurant',
        vendorId: restaurant._id.toString(),
        originalPayoutId: 'old-payout-id',
        provider: 'paystack',
        currency: 'NGN',
        amount: 8.5,
        remainingAmount: 8.5,
        status: 'pending',
      });

      const vendorNotified = notify.mock.calls.some(
        ([input]: [{ userId: string; type: string }]) =>
          input.userId === 'owner-id' &&
          input.type === 'refund_clawback_created',
      );
      expect(vendorNotified).toBe(true);
    });

    it('finalizeRefund creates NO clawback when the order was never paid out (the common case)', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );
      // vendorPayoutId stays null — never paid out.

      await ordersService.claimForRefund(order._id.toString());
      await ordersService.finalizeRefund(order._id.toString());

      const clawbacks = await payoutClawbackModel
        .find({ orderId: order._id.toString() })
        .exec();
      expect(clawbacks).toHaveLength(0);
    });

    it('notifies every admin about the clawback', async () => {
      listAll.mockResolvedValueOnce({
        items: [{ _id: { toString: () => 'admin-1' } }],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );
      await orderModel
        .updateOne({ _id: order._id }, { vendorPayoutId: 'old-payout-id' })
        .exec();

      await ordersService.claimForRefund(order._id.toString());
      await ordersService.finalizeRefund(order._id.toString());

      const adminNotified = notify.mock.calls.some(
        ([input]: [{ userId: string; type: string }]) =>
          input.userId === 'admin-1' &&
          input.type === 'refund_clawback_created',
      );
      expect(adminNotified).toBe(true);
    });
  });

  describe('ambiguous refund reconciliation (docs/ROADMAP.md FDP-104)', () => {
    it('flagAmbiguousRefund reverts status but keeps the order flagged, blocking a further claimForRefund', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );
      await ordersService.claimForRefund(order._id.toString());

      await ordersService.flagAmbiguousRefund(
        order._id.toString(),
        'DELIVERED',
        'connection reset mid-request',
      );

      const reloaded = await orderModel.findById(order._id).exec();
      expect(reloaded?.status).toBe('DELIVERED'); // reverted — never falsely shows REFUNDED
      expect(reloaded?.paymentStatus).toBe('succeeded');
      expect(reloaded?.refundReconciliationRequired).toBe(true);
      expect(reloaded?.refundFailureReason).toBe(
        'connection reset mid-request',
      );

      const secondClaim = await ordersService.claimForRefund(
        order._id.toString(),
      );
      expect(secondClaim).toBeNull(); // blocked until resolved
    });

    it('resolveRefundReconciliation(true) finalizes the refund for real, clawback included', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );
      await orderModel
        .updateOne({ _id: order._id }, { vendorPayoutId: 'old-payout-id' })
        .exec();
      await ordersService.claimForRefund(order._id.toString());
      await ordersService.flagAmbiguousRefund(
        order._id.toString(),
        'DELIVERED',
        'connection reset',
      );

      const resolved = await ordersService.resolveRefundReconciliation(
        order._id.toString(),
        true,
      );

      expect(resolved.status).toBe('REFUNDED');
      expect(resolved.paymentStatus).toBe('refunded');
      expect(resolved.refundReconciliationRequired).toBe(false);
      const clawbacks = await payoutClawbackModel
        .find({ orderId: order._id.toString() })
        .exec();
      expect(clawbacks).toHaveLength(1); // the reconciliation success path still runs it
    });

    it('resolveRefundReconciliation(false) just clears the flag, leaving the order refundable again', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );
      await ordersService.claimForRefund(order._id.toString());
      await ordersService.flagAmbiguousRefund(
        order._id.toString(),
        'DELIVERED',
        'connection reset',
      );

      const resolved = await ordersService.resolveRefundReconciliation(
        order._id.toString(),
        false,
      );

      expect(resolved.status).toBe('DELIVERED');
      expect(resolved.refundReconciliationRequired).toBe(false);
      const secondClaim = await ordersService.claimForRefund(
        order._id.toString(),
      );
      expect(secondClaim).not.toBeNull(); // refundable again
    });

    it('rejects resolving an order that was never flagged', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );

      await expect(
        ordersService.resolveRefundReconciliation(order._id.toString(), true),
      ).rejects.toThrow('This order is not flagged for refund reconciliation');
    });
  });

  describe('dispute flagging (docs/ROADMAP.md FDP-104)', () => {
    it('flagDispute sets disputeFlagged without touching status/paymentStatus, and notifies admins', async () => {
      listAll.mockResolvedValueOnce({
        items: [{ _id: { toString: () => 'admin-1' } }],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );

      await ordersService.flagDispute(order._id.toString());

      const reloaded = await orderModel.findById(order._id).exec();
      expect(reloaded?.disputeFlagged).toBe(true);
      expect(reloaded?.status).toBe('DELIVERED');
      expect(reloaded?.paymentStatus).toBe('succeeded');
      const adminNotified = notify.mock.calls.some(
        ([input]: [{ userId: string; type: string }]) =>
          input.userId === 'admin-1' && input.type === 'order_dispute_flagged',
      );
      expect(adminNotified).toBe(true);
    });
  });

  describe('findNeedingRefundAttention (docs/ROADMAP.md FDP-104)', () => {
    it('includes a CANCELLED order whose payment was never refunded', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'CANCELLED',
        { paymentStatus: 'succeeded' },
      );

      const result = await ordersService.findNeedingRefundAttention();
      expect(result.map((o) => o._id.toString())).toContain(
        order._id.toString(),
      );
    });

    it('includes an order flagged refundReconciliationRequired', async () => {
      const restaurant = await createApprovedRestaurant();
      const order = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );
      await ordersService.claimForRefund(order._id.toString());
      await ordersService.flagAmbiguousRefund(
        order._id.toString(),
        'DELIVERED',
        'connection reset',
      );

      const result = await ordersService.findNeedingRefundAttention();
      expect(result.map((o) => o._id.toString())).toContain(
        order._id.toString(),
      );
    });

    it('excludes a normal DELIVERED order and a CANCELLED order that was never paid', async () => {
      const restaurant = await createApprovedRestaurant();
      const delivered = await createOrderAtStatus(
        restaurant._id.toString(),
        'DELIVERED',
        { paymentStatus: 'succeeded' },
      );
      const cancelledUnpaid = await createOrderAtStatus(
        restaurant._id.toString(),
        'CANCELLED',
        { paymentStatus: 'pending' },
      );

      const result = await ordersService.findNeedingRefundAttention();
      const ids = result.map((o) => o._id.toString());
      expect(ids).not.toContain(delivered._id.toString());
      expect(ids).not.toContain(cancelledUnpaid._id.toString());
    });
  });

  describe('getAnalyticsSummary', () => {
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

  describe('findAllForAdmin (docs/ROADMAP.md FDP-128)', () => {
    async function createApprovedStoreFor(currency = 'NGN') {
      const store = await storesService.create('owner-id', {
        name: 'Market Square Supermarket',
        type: 'groceries',
        currency,
        country: 'Nigeria',
        address: validAddress,
        complianceDocumentUrl: 'https://example.com/doc.pdf',
        businessRegistrationNumber: 'RC1234567',
      });
      return storesService.approve(store._id.toString());
    }

    it('returns every order across every vendor, paginated, with vendor names resolved', async () => {
      const restaurant = await createApprovedRestaurant('NGN');
      const store = await createApprovedStoreFor('NGN');

      await orderModel.create({
        orderNumber: 'ORD-TX1',
        customerId: userId,
        sellerType: 'restaurant',
        restaurantId: restaurant._id,
        items: [{ name: 'Jollof Rice', price: 100, qty: 2 }],
        subtotal: 200,
        deliveryFee: 20,
        serviceFee: 10,
        tax: 0,
        discount: 0,
        total: 230,
        platformFeeAmount: 30,
        restaurantPayoutAmount: 170,
        currency: 'NGN',
        status: 'DELIVERED',
        statusHistory: [],
        paymentProvider: 'paystack',
        paymentStatus: 'succeeded',
        deliveryAddress: validAddress,
      });
      await orderModel.create({
        orderNumber: 'ORD-TX2',
        customerId: userId,
        sellerType: 'store',
        storeId: store._id,
        items: [{ name: 'Fresh Milk 1L', price: 500, qty: 1 }],
        subtotal: 500,
        deliveryFee: 50,
        serviceFee: 25,
        tax: 0,
        discount: 0,
        total: 575,
        platformFeeAmount: 75,
        restaurantPayoutAmount: 425,
        currency: 'NGN',
        status: 'PLACED',
        statusHistory: [],
        paymentProvider: 'paystack',
        paymentStatus: 'succeeded',
        deliveryAddress: validAddress,
      });

      const result = await ordersService.findAllForAdmin({
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
      expect(result.items).toHaveLength(2);

      const restaurantTx = result.items.find(
        (t) => t.orderNumber === 'ORD-TX1',
      );
      expect(restaurantTx?.vendor).toEqual({
        type: 'restaurant',
        id: restaurant._id.toString(),
        name: 'Burgundy Kitchen',
      });
      expect(restaurantTx?.items).toEqual([
        { name: 'Jollof Rice', price: 100, qty: 2 },
      ]);
      // Categorical fee breakdown (docs/ROADMAP.md FDP-129) — every field the admin ledger now
      // shows per transaction, plus each *RatePct derived from this order's own stored amounts.
      expect(restaurantTx?.serviceFee).toBe(10);
      expect(restaurantTx?.tax).toBe(0);
      expect(restaurantTx?.discount).toBe(0);
      expect(restaurantTx?.payoutAmount).toBe(170);
      expect(restaurantTx?.platformFeeRatePct).toBe(15); // 30 / 200 * 100
      expect(restaurantTx?.serviceFeeRatePct).toBe(5); // 10 / 200 * 100
      expect(restaurantTx?.taxRatePct).toBe(0);
      expect(restaurantTx?.deliveryFeeSharePct).toBeCloseTo(8.7, 1); // 20 / 230 * 100

      const storeTx = result.items.find((t) => t.orderNumber === 'ORD-TX2');
      expect(storeTx?.vendor).toEqual({
        type: 'store',
        id: store._id.toString(),
        name: 'Market Square Supermarket',
      });
    });

    it('filters by vendorType', async () => {
      const restaurant = await createApprovedRestaurant('NGN');
      const store = await createApprovedStoreFor('NGN');
      await orderModel.create({
        orderNumber: 'ORD-VT1',
        customerId: userId,
        sellerType: 'restaurant',
        restaurantId: restaurant._id,
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
        orderNumber: 'ORD-VT2',
        customerId: userId,
        sellerType: 'store',
        storeId: store._id,
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

      const restaurantOnly = await ordersService.findAllForAdmin({
        vendorType: 'restaurant',
        page: 1,
        limit: 20,
      });
      expect(restaurantOnly.items.map((t) => t.orderNumber)).toEqual([
        'ORD-VT1',
      ]);

      const storeOnly = await ordersService.findAllForAdmin({
        vendorType: 'store',
        page: 1,
        limit: 20,
      });
      expect(storeOnly.items.map((t) => t.orderNumber)).toEqual(['ORD-VT2']);
    });

    it('totalsByCurrency only counts succeeded/refunded payments, grouped by currency, over the whole filtered set not just the current page', async () => {
      const restaurantNgn = await createApprovedRestaurant('NGN');
      const restaurantUsd = await createApprovedRestaurant('USD');
      await orderModel.create({
        orderNumber: 'ORD-TOT1',
        customerId: userId,
        sellerType: 'restaurant',
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
        orderNumber: 'ORD-TOT2',
        customerId: userId,
        sellerType: 'restaurant',
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
        status: 'CANCELLED',
        statusHistory: [],
        paymentProvider: 'paystack',
        paymentStatus: 'pending', // never collected — excluded from totals
        deliveryAddress: validAddress,
      });
      await orderModel.create({
        orderNumber: 'ORD-TOT3',
        customerId: userId,
        sellerType: 'restaurant',
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
        status: 'DELIVERED',
        statusHistory: [],
        paymentProvider: 'stripe',
        paymentStatus: 'succeeded',
        deliveryAddress: validAddress,
      });

      // Page 1 with limit 1 — only 1 order visible on this page, but totals must reflect all 3.
      const result = await ordersService.findAllForAdmin({ page: 1, limit: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(3);
      expect(result.totalsByCurrency).toEqual({ NGN: 115, USD: 23 });
    });

    it('does not crash on a legacy-shaped order document with sellerType set but its matching id field missing', async () => {
      await orderModel.collection.insertOne({
        orderNumber: 'ORD-LEGACY',
        customerId: userId,
        sellerType: 'restaurant',
        // restaurantId deliberately absent — never written at all.
        items: [],
        subtotal: 10,
        deliveryFee: 1,
        serviceFee: 0.5,
        tax: 0,
        discount: 0,
        total: 11.5,
        platformFeeAmount: 1.5,
        restaurantPayoutAmount: 8.5,
        currency: 'NGN',
        status: 'DELIVERED',
        statusHistory: [],
        paymentProvider: 'paystack',
        paymentStatus: 'succeeded',
        deliveryAddress: validAddress,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await ordersService.findAllForAdmin({
        page: 1,
        limit: 20,
      });
      const legacy = result.items.find((t) => t.orderNumber === 'ORD-LEGACY');
      expect(legacy?.vendor.name).toBe('Unknown vendor');
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

  describe('nearest-rider dispatch (docs/ROADMAP.md FDP-98)', () => {
    const owner = {
      sub: 'owner-id',
      email: 'owner@test.local',
      role: 'restaurant_owner',
    } as const;

    // Restaurant sits here for every test in this block.
    const restaurantOrigin = { lat: 6.5, lng: 3.35 };

    async function createRider(
      lat: number,
      lng: number,
      overrides: Partial<{ isOnline: boolean; isVerified: boolean }> = {},
    ): Promise<string> {
      const userId = new Types.ObjectId().toString();
      await riderModel.create({
        userId,
        vehicleType: 'bicycle',
        isOnline: overrides.isOnline ?? true,
        isVerified: overrides.isVerified ?? true,
        currentLocation: { type: 'Point', coordinates: [lng, lat] },
        locationUpdatedAt: new Date(),
        dateOfBirth: new Date('1995-01-01'),
        governmentIdType: 'national_id',
        governmentIdNumber: 'A1234567',
        governmentIdDocumentUrl: 'https://example.com/id.pdf',
        proofOfAddressDocumentUrl: 'https://example.com/address.pdf',
        guarantor: {
          fullName: 'Jane Guarantor',
          phone: '+2348000000000',
          relationship: 'Sister',
          address: '1 Guarantor St',
        },
        nextOfKinName: 'John Next',
        nextOfKinPhone: '+2348000000001',
        nextOfKinRelationship: 'Brother',
      });
      return userId;
    }

    async function readyOrderFrom(restaurantId: string) {
      const order = await createOrderAtStatus(restaurantId, 'PREPARING');
      return ordersService.updateStatusByOwner(
        owner,
        order._id.toString(),
        'READY_FOR_PICKUP',
      );
    }

    it('auto-assigns the nearest online, verified rider once an order becomes READY_FOR_PICKUP', async () => {
      const restaurant = await createApprovedRestaurant('NGN', {
        line1: '1 Main St',
        city: 'Lagos',
        state: 'Lagos',
        ...restaurantOrigin,
      });
      const closeRiderId = await createRider(6.501, 3.35); // ~0.11km away
      const farRiderId = await createRider(6.55, 3.35); // ~5.5km away

      const order = await readyOrderFrom(restaurant._id.toString());

      expect(order.status).toBe('ASSIGNED_TO_RIDER');
      expect(order.riderId?.toString()).toBe(closeRiderId);
      expect(order.riderId?.toString()).not.toBe(farRiderId);
      expect(order.statusHistory.at(-1)).toMatchObject({
        status: 'ASSIGNED_TO_RIDER',
        by: closeRiderId,
      });
    });

    it('skips the nearest rider if they already have an active delivery, dispatching to the next-nearest instead', async () => {
      const restaurant = await createApprovedRestaurant('NGN', {
        line1: '1 Main St',
        city: 'Lagos',
        state: 'Lagos',
        ...restaurantOrigin,
      });
      const busyRiderId = await createRider(6.501, 3.35); // nearest, but already busy
      const freeRiderId = await createRider(6.52, 3.35); // next-nearest, free

      const otherRestaurant = await createApprovedRestaurant('NGN', {
        line1: '2 Other St',
        city: 'Lagos',
        state: 'Lagos',
      });
      const busyOrder = await createOrderAtStatus(
        otherRestaurant._id.toString(),
        'ASSIGNED_TO_RIDER',
      );
      await orderModel
        .updateOne({ _id: busyOrder._id }, { riderId: busyRiderId })
        .exec();

      const order = await readyOrderFrom(restaurant._id.toString());

      expect(order.riderId?.toString()).toBe(freeRiderId);
    });

    it('never dispatches to an unverified rider, even if they are nearest', async () => {
      const restaurant = await createApprovedRestaurant('NGN', {
        line1: '1 Main St',
        city: 'Lagos',
        state: 'Lagos',
        ...restaurantOrigin,
      });
      await createRider(6.501, 3.35, { isVerified: false });
      const verifiedRiderId = await createRider(6.52, 3.35);

      const order = await readyOrderFrom(restaurant._id.toString());

      expect(order.riderId?.toString()).toBe(verifiedRiderId);
    });

    it('never dispatches to an offline rider, even if they are nearest', async () => {
      const restaurant = await createApprovedRestaurant('NGN', {
        line1: '1 Main St',
        city: 'Lagos',
        state: 'Lagos',
        ...restaurantOrigin,
      });
      await createRider(6.501, 3.35, { isOnline: false });
      const onlineRiderId = await createRider(6.52, 3.35);

      const order = await readyOrderFrom(restaurant._id.toString());

      expect(order.riderId?.toString()).toBe(onlineRiderId);
    });

    it('leaves the order unassigned (for the manual queue) when nobody eligible is nearby', async () => {
      const restaurant = await createApprovedRestaurant('NGN', {
        line1: '1 Main St',
        city: 'Lagos',
        state: 'Lagos',
        ...restaurantOrigin,
      });
      // Well outside the dispatch radius.
      await createRider(7.5, 3.35);

      const order = await readyOrderFrom(restaurant._id.toString());

      expect(order.status).toBe('READY_FOR_PICKUP');
      expect(order.riderId).toBeNull();
    });

    it('leaves the order unassigned when the restaurant has no geocoded address', async () => {
      const restaurant = await createApprovedRestaurant('NGN', {
        line1: '1 Main St',
        city: 'Lagos',
        state: 'Lagos',
        // no lat/lng
      });
      await createRider(6.501, 3.35);

      const order = await readyOrderFrom(restaurant._id.toString());

      expect(order.status).toBe('READY_FOR_PICKUP');
      expect(order.riderId).toBeNull();
    });

    it('leaves the order unassigned when no rider has ever shared a location', async () => {
      const restaurant = await createApprovedRestaurant('NGN', {
        line1: '1 Main St',
        city: 'Lagos',
        state: 'Lagos',
        ...restaurantOrigin,
      });
      // Online and verified, but currentLocation stays null — never resolvable by $geoNear.
      await riderModel.create({
        userId: new Types.ObjectId().toString(),
        vehicleType: 'bicycle',
        isOnline: true,
        isVerified: true,
        dateOfBirth: new Date('1995-01-01'),
        governmentIdType: 'national_id',
        governmentIdNumber: 'A1234567',
        governmentIdDocumentUrl: 'https://example.com/id.pdf',
        proofOfAddressDocumentUrl: 'https://example.com/address.pdf',
        guarantor: {
          fullName: 'Jane Guarantor',
          phone: '+2348000000000',
          relationship: 'Sister',
          address: '1 Guarantor St',
        },
        nextOfKinName: 'John Next',
        nextOfKinPhone: '+2348000000001',
        nextOfKinRelationship: 'Brother',
      });

      const order = await readyOrderFrom(restaurant._id.toString());

      expect(order.status).toBe('READY_FOR_PICKUP');
      expect(order.riderId).toBeNull();
    });
  });

  describe('reorder (docs/ROADMAP.md FDP-97)', () => {
    it('rebuilds the cart from a past order the customer owns', async () => {
      const restaurant = await createApprovedRestaurant('NGN');
      const item = await createItem(restaurant._id.toString(), 100);
      await cartService.addItem(userId, {
        menuItemId: item._id.toString(),
        qty: 2,
      });
      const order = await ordersService.createOrder(userId, {
        deliveryAddress: validAddress,
      });

      const result = await ordersService.reorder(userId, order._id.toString());

      expect(result.skippedItems).toEqual([]);
      expect(result.cart.restaurantId).toBe(restaurant._id.toString());
      expect(result.cart.items).toHaveLength(1);
      expect(result.cart.items[0].qty).toBe(2);
    });

    it('rejects reordering an order that belongs to a different customer', async () => {
      const restaurant = await createApprovedRestaurant('NGN');
      const item = await createItem(restaurant._id.toString(), 100);
      await cartService.addItem('other-customer-id', {
        menuItemId: item._id.toString(),
      });
      const order = await ordersService.createOrder('other-customer-id', {
        deliveryAddress: validAddress,
      });

      await expect(
        ordersService.reorder(userId, order._id.toString()),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
