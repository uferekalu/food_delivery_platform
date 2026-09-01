import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { MenuService } from './menu.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import {
  Restaurant,
  RestaurantDocument,
  RestaurantSchema,
} from '../restaurants/schemas/restaurant.schema';
import {
  MenuCategory,
  MenuCategoryDocument,
  MenuCategorySchema,
} from './schemas/menu-category.schema';
import {
  MenuItem,
  MenuItemDocument,
  MenuItemSchema,
} from './schemas/menu-item.schema';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';

jest.setTimeout(30_000);

describe('MenuService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let menuService: MenuService;
  let restaurantsService: RestaurantsService;
  let restaurantModel: Model<RestaurantDocument>;
  let categoryModel: Model<MenuCategoryDocument>;
  let itemModel: Model<MenuItemDocument>;

  const owner: AccessTokenPayload = {
    sub: 'owner-id',
    email: 'owner@example.com',
    role: 'restaurant_owner',
  };
  const stranger: AccessTokenPayload = {
    sub: 'stranger-id',
    email: 'stranger@example.com',
    role: 'restaurant_owner',
  };

  beforeAll(async () => {
    // See backend/CLAUDE.md ("Testing") for why launchTimeout is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Restaurant.name, schema: RestaurantSchema },
          { name: MenuCategory.name, schema: MenuCategorySchema },
          { name: MenuItem.name, schema: MenuItemSchema },
        ]),
      ],
      providers: [MenuService, RestaurantsService],
    }).compile();

    menuService = moduleRef.get(MenuService);
    restaurantsService = moduleRef.get(RestaurantsService);
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    categoryModel = moduleRef.get(getModelToken(MenuCategory.name));
    itemModel = moduleRef.get(getModelToken(MenuItem.name));
  }, 60_000); // headroom for the 60s mongod launchTimeout above, not just module compile

  afterEach(async () => {
    await Promise.all([
      restaurantModel.deleteMany({}).exec(),
      categoryModel.deleteMany({}).exec(),
      itemModel.deleteMany({}).exec(),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  async function createTestRestaurant() {
    return restaurantsService.create(owner.sub, {
      name: 'Burgundy Kitchen',
      cuisineTypes: ['Nigerian'],
      currency: 'NGN',
      country: 'Nigeria',
      address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
      complianceDocumentUrl: 'https://example.com/doc.pdf',
    });
  }

  it('rejects a stranger creating a category on a restaurant they do not own', async () => {
    const restaurant = await createTestRestaurant();
    await expect(
      menuService.createCategory(restaurant._id.toString(), stranger, {
        name: 'Starters',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects creating an item under a category that does not belong to the restaurant', async () => {
    const restaurantA = await createTestRestaurant();
    const restaurantB = await restaurantsService.create(owner.sub, {
      name: 'Second Spot',
      cuisineTypes: ['Italian'],
      currency: 'NGN',
      country: 'Nigeria',
      address: { line1: '2 Main St', city: 'Lagos', state: 'Lagos' },
      complianceDocumentUrl: 'https://example.com/doc.pdf',
    });
    const categoryOnB = await menuService.createCategory(
      restaurantB._id.toString(),
      owner,
      { name: 'Mains' },
    );

    await expect(
      menuService.createItem(restaurantA._id.toString(), owner, {
        categoryId: categoryOnB._id.toString(),
        name: 'Cross-restaurant item',
        price: 10,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('builds a menu grouping items under their category, and cascade-deletes items with their category', async () => {
    const restaurant = await createTestRestaurant();
    const restaurantId = restaurant._id.toString();

    const starters = await menuService.createCategory(restaurantId, owner, {
      name: 'Starters',
      sortOrder: 0,
    });
    const mains = await menuService.createCategory(restaurantId, owner, {
      name: 'Mains',
      sortOrder: 1,
    });

    await menuService.createItem(restaurantId, owner, {
      categoryId: starters._id.toString(),
      name: 'Spring Rolls',
      price: 5,
    });
    await menuService.createItem(restaurantId, owner, {
      categoryId: mains._id.toString(),
      name: 'Jollof Rice',
      price: 12,
    });

    const menu = await menuService.getMenu(restaurantId);
    expect(menu).toHaveLength(2);
    expect(menu[0].name).toBe('Starters');
    expect(menu[0].items).toHaveLength(1);
    expect(menu[0].items[0].name).toBe('Spring Rolls');
    expect(menu[1].items[0].name).toBe('Jollof Rice');

    await menuService.deleteCategory(
      restaurantId,
      starters._id.toString(),
      owner,
    );
    const afterDelete = await menuService.getMenu(restaurantId);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].name).toBe('Mains');
    const remainingItems = await itemModel.find({ restaurantId }).exec();
    expect(remainingItems).toHaveLength(1);
    expect(remainingItems[0].name).toBe('Jollof Rice');
  });

  it('toggles item availability', async () => {
    const restaurant = await createTestRestaurant();
    const restaurantId = restaurant._id.toString();
    const category = await menuService.createCategory(restaurantId, owner, {
      name: 'Mains',
    });
    const item = await menuService.createItem(restaurantId, owner, {
      categoryId: category._id.toString(),
      name: 'Jollof Rice',
      price: 12,
    });
    expect(item.isAvailable).toBe(true);

    const toggled = await menuService.toggleItemAvailability(
      restaurantId,
      item._id.toString(),
      owner,
    );
    expect(toggled.isAvailable).toBe(false);
  });
});
