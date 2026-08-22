import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { CartService } from './cart.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
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
import { Cart, CartDocument, CartSchema } from './schemas/cart.schema';

jest.setTimeout(30_000);

describe('CartService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let cartService: CartService;
  let restaurantsService: RestaurantsService;
  let restaurantModel: Model<RestaurantDocument>;
  let itemModel: Model<MenuItemDocument>;
  let cartModel: Model<CartDocument>;

  const userId = 'customer-id';

  beforeAll(async () => {
    // See auth.e2e-spec.ts (backend/CLAUDE.md) for why `launchTimeout` is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Restaurant.name, schema: RestaurantSchema },
          { name: MenuItem.name, schema: MenuItemSchema },
          { name: Cart.name, schema: CartSchema },
        ]),
      ],
      providers: [CartService, RestaurantsService],
    }).compile();

    cartService = moduleRef.get(CartService);
    restaurantsService = moduleRef.get(RestaurantsService);
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    itemModel = moduleRef.get(getModelToken(MenuItem.name));
    cartModel = moduleRef.get(getModelToken(Cart.name));
  }, 60_000);

  afterEach(async () => {
    await Promise.all([
      restaurantModel.deleteMany({}).exec(),
      itemModel.deleteMany({}).exec(),
      cartModel.deleteMany({}).exec(),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  async function createApprovedRestaurant(name = 'Burgundy Kitchen') {
    const restaurant = await restaurantsService.create('owner-id', {
      name,
      cuisineTypes: ['Nigerian'],
      currency: 'NGN',
      country: 'Nigeria',
      address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
    });
    return restaurantsService.approve(restaurant._id.toString());
  }

  interface TestModifierGroup {
    name: string;
    min: number;
    max: number;
    options: { name: string; priceDelta: number }[];
  }

  async function createItem(
    restaurantId: string,
    overrides: Partial<{
      name: string;
      price: number;
      isAvailable: boolean;
      modifierGroups: TestModifierGroup[];
    }> = {},
  ) {
    return itemModel.create({
      restaurantId,
      categoryId: restaurantId, // not exercised by CartService; any ObjectId-shaped value works
      name: overrides.name ?? 'Jollof Rice',
      price: overrides.price ?? 12,
      isAvailable: overrides.isAvailable ?? true,
      modifierGroups: overrides.modifierGroups ?? [],
    });
  }

  it('returns an empty cart when none exists', async () => {
    const cart = await cartService.getCart(userId);
    expect(cart).toEqual({ restaurantId: null, restaurantName: null, currency: null, items: [], subtotal: 0 });
  });

  it('adds an item and computes the subtotal', async () => {
    const restaurant = await createApprovedRestaurant();
    const item = await createItem(restaurant._id.toString(), { price: 12 });

    const cart = await cartService.addItem(userId, {
      menuItemId: item._id.toString(),
      qty: 2,
    });

    expect(cart.restaurantId).toBe(restaurant._id.toString());
    expect(cart.restaurantName).toBe('Burgundy Kitchen');
    expect(cart.currency).toBe('NGN');
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].qty).toBe(2);
    expect(cart.subtotal).toBe(24);
  });

  it('merges an identical add (same item, same modifiers, same notes) into the existing line', async () => {
    const restaurant = await createApprovedRestaurant();
    const item = await createItem(restaurant._id.toString(), { price: 10 });

    await cartService.addItem(userId, {
      menuItemId: item._id.toString(),
      qty: 1,
    });
    const cart = await cartService.addItem(userId, {
      menuItemId: item._id.toString(),
      qty: 1,
    });

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].qty).toBe(2);
  });

  it('resolves modifier priceDelta server-side and validates min/max selections', async () => {
    const restaurant = await createApprovedRestaurant();
    const item = await createItem(restaurant._id.toString(), {
      price: 10,
      modifierGroups: [
        {
          name: 'Size',
          min: 1,
          max: 1,
          options: [
            { name: 'Large', priceDelta: 2 },
            { name: 'Small', priceDelta: 0 },
          ],
        },
      ],
    });

    // Missing the required "Size" selection.
    await expect(
      cartService.addItem(userId, { menuItemId: item._id.toString() }),
    ).rejects.toThrow(BadRequestException);

    const cart = await cartService.addItem(userId, {
      menuItemId: item._id.toString(),
      selectedModifiers: [{ groupName: 'Size', optionName: 'Large' }],
    });

    // Mapped to plain objects before comparing — `selectedModifiers` here is a live Mongoose
    // subdocument array, and Jest's `toEqual` deep-equality walk trips over its internal
    // strict-mode getters ("'caller', 'callee', and 'arguments' properties may not be
    // accessed...") when comparing it directly against a plain-object expectation.
    const modifiers = cart.items[0].selectedModifiers.map((m) => ({
      groupName: m.groupName,
      optionName: m.optionName,
      priceDelta: m.priceDelta,
    }));
    expect(modifiers).toEqual([{ groupName: 'Size', optionName: 'Large', priceDelta: 2 }]);
    expect(cart.subtotal).toBe(12); // 10 + 2 priceDelta, qty 1
  });

  it('rejects a client-supplied priceDelta by ignoring it and using the server-resolved value', async () => {
    const restaurant = await createApprovedRestaurant();
    const item = await createItem(restaurant._id.toString(), {
      price: 10,
      modifierGroups: [
        {
          name: 'Size',
          min: 1,
          max: 1,
          options: [{ name: 'Large', priceDelta: 2 }],
        },
      ],
    });

    const cart = await cartService.addItem(userId, {
      menuItemId: item._id.toString(),
      // @ts-expect-error -- simulating a malicious/stale client payload with a forged priceDelta
      selectedModifiers: [
        { groupName: 'Size', optionName: 'Large', priceDelta: 999 },
      ],
    });

    expect(cart.items[0].selectedModifiers[0].priceDelta).toBe(2);
  });

  it('rejects adding an item from a different restaurant without replace: true, and clears the cart when replace is set', async () => {
    const restaurantA = await createApprovedRestaurant('Restaurant A');
    const restaurantB = await createApprovedRestaurant('Restaurant B');
    const itemA = await createItem(restaurantA._id.toString(), {
      name: 'From A',
    });
    const itemB = await createItem(restaurantB._id.toString(), {
      name: 'From B',
    });

    await cartService.addItem(userId, { menuItemId: itemA._id.toString() });

    await expect(
      cartService.addItem(userId, { menuItemId: itemB._id.toString() }),
    ).rejects.toThrow(ConflictException);

    const cart = await cartService.addItem(userId, {
      menuItemId: itemB._id.toString(),
      replace: true,
    });

    expect(cart.restaurantId).toBe(restaurantB._id.toString());
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].name).toBe('From B');
  });

  it('rejects adding an unavailable item', async () => {
    const restaurant = await createApprovedRestaurant();
    const item = await createItem(restaurant._id.toString(), {
      isAvailable: false,
    });

    await expect(
      cartService.addItem(userId, { menuItemId: item._id.toString() }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects adding an item from a restaurant that is not approved', async () => {
    const restaurant = await restaurantsService.create('owner-id', {
      name: 'Pending Restaurant',
      cuisineTypes: ['Test'],
      currency: 'NGN',
      country: 'Nigeria',
      address: { line1: '1 St', city: 'Lagos', state: 'Lagos' },
    });
    const item = await createItem(restaurant._id.toString());

    await expect(
      cartService.addItem(userId, { menuItemId: item._id.toString() }),
    ).rejects.toThrow(BadRequestException);
  });

  it('updates an item quantity and removes an item, deleting the cart once empty', async () => {
    const restaurant = await createApprovedRestaurant();
    const item = await createItem(restaurant._id.toString(), { price: 5 });
    const afterAdd = await cartService.addItem(userId, {
      menuItemId: item._id.toString(),
    });
    const cartItemId = afterAdd.items[0]._id.toString();

    const afterUpdate = await cartService.updateItem(userId, cartItemId, {
      qty: 3,
    });
    expect(afterUpdate.items[0].qty).toBe(3);
    expect(afterUpdate.subtotal).toBe(15);

    const afterRemove = await cartService.removeItem(userId, cartItemId);
    expect(afterRemove).toEqual({ restaurantId: null, restaurantName: null, currency: null, items: [], subtotal: 0 });

    const cartInDb = await cartModel.findOne({ userId }).exec();
    expect(cartInDb).toBeNull();
  });

  it('throws when updating/removing from a cart that does not exist', async () => {
    await expect(
      cartService.updateItem(userId, 'nonexistent-id', { qty: 2 }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      cartService.removeItem(userId, 'nonexistent-id'),
    ).rejects.toThrow(NotFoundException);
  });

  it('clearCart is a no-op when no cart exists, and deletes an existing cart', async () => {
    await expect(cartService.clearCart(userId)).resolves.toBeUndefined();

    const restaurant = await createApprovedRestaurant();
    const item = await createItem(restaurant._id.toString());
    await cartService.addItem(userId, { menuItemId: item._id.toString() });

    await cartService.clearCart(userId);
    const cart = await cartService.getCart(userId);
    expect(cart).toEqual({ restaurantId: null, restaurantName: null, currency: null, items: [], subtotal: 0 });
  });
});
