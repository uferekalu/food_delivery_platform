import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { OrdersService } from './orders.service';
import { CartService } from '../cart/cart.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { PromoCodesService } from '../promo-codes/promo-codes.service';
import { PaymentProviderResolver } from '../payments/provider-resolver';
import { Order, OrderDocument, OrderSchema } from './schemas/order.schema';
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
      ],
    }).compile();

    ordersService = moduleRef.get(OrdersService);
    cartService = moduleRef.get(CartService);
    restaurantsService = moduleRef.get(RestaurantsService);
    promoCodesService = moduleRef.get(PromoCodesService);
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
});
