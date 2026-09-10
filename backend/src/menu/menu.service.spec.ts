import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { MenuService } from './menu.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { BusinessVerificationService } from '../business-verification/business-verification.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  // Mocked, not real — see RestaurantsService's own spec for the full reasoning
  // (docs/ROADMAP.md FDP-115).
  let verifyBusinessRegistration: jest.Mock;
  let notify: jest.Mock;
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

    verifyBusinessRegistration = jest.fn().mockResolvedValue({
      outcome: 'unknown',
      reason: 'Youverify not configured',
    });
    notify = jest.fn().mockResolvedValue(undefined);

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Restaurant.name, schema: RestaurantSchema },
          { name: MenuCategory.name, schema: MenuCategorySchema },
          { name: MenuItem.name, schema: MenuItemSchema },
        ]),
      ],
      providers: [
        MenuService,
        RestaurantsService,
        {
          provide: BusinessVerificationService,
          useValue: { verifyBusinessRegistration },
        },
        { provide: NotificationsService, useValue: { notify } },
      ],
    }).compile();

    menuService = moduleRef.get(MenuService);
    restaurantsService = moduleRef.get(RestaurantsService);
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    categoryModel = moduleRef.get(getModelToken(MenuCategory.name));
    itemModel = moduleRef.get(getModelToken(MenuItem.name));
  }, 60_000); // headroom for the 60s mongod launchTimeout above, not just module compile

  beforeEach(() => {
    verifyBusinessRegistration.mockReset().mockResolvedValue({
      outcome: 'unknown',
      reason: 'Youverify not configured',
    });
    notify.mockReset().mockResolvedValue(undefined);
  });

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
      businessRegistrationNumber: 'RC1234567',
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
      businessRegistrationNumber: 'RC1234567',
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

  it('sets a discountedPrice below price (docs/ROADMAP.md FDP-111)', async () => {
    const restaurant = await createTestRestaurant();
    const restaurantId = restaurant._id.toString();
    const category = await menuService.createCategory(restaurantId, owner, {
      name: 'Mains',
    });

    const item = await menuService.createItem(restaurantId, owner, {
      categoryId: category._id.toString(),
      name: 'Jollof Rice',
      price: 1500,
      discountedPrice: 1400,
    });

    expect(item.discountedPrice).toBe(1400);
  });

  it('rejects a discountedPrice that is not lower than price, on create and on update', async () => {
    const restaurant = await createTestRestaurant();
    const restaurantId = restaurant._id.toString();
    const category = await menuService.createCategory(restaurantId, owner, {
      name: 'Mains',
    });

    await expect(
      menuService.createItem(restaurantId, owner, {
        categoryId: category._id.toString(),
        name: 'Jollof Rice',
        price: 1500,
        discountedPrice: 1500,
      }),
    ).rejects.toThrow(BadRequestException);

    const item = await menuService.createItem(restaurantId, owner, {
      categoryId: category._id.toString(),
      name: 'Fried Rice',
      price: 1500,
    });
    await expect(
      menuService.updateItem(restaurantId, item._id.toString(), owner, {
        discountedPrice: 1600,
      }),
    ).rejects.toThrow(BadRequestException);
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

  describe('createItem auto-approval trigger (docs/ROADMAP.md FDP-115)', () => {
    it('auto-approves the restaurant when it was auto-verified and this is its first item', async () => {
      verifyBusinessRegistration.mockResolvedValue({
        outcome: 'verified',
        registeredName: 'Burgundy Kitchen Ltd',
        registeredAddress: null,
        rawStatus: 'active',
      });
      const restaurant = await createTestRestaurant();
      const restaurantId = restaurant._id.toString();
      expect(restaurant.isApproved).toBe(false);
      const category = await menuService.createCategory(restaurantId, owner, {
        name: 'Mains',
      });

      await menuService.createItem(restaurantId, owner, {
        categoryId: category._id.toString(),
        name: 'Jollof Rice',
        price: 12,
      });

      const reloaded = await restaurantsService.findByIdOrThrow(restaurantId);
      expect(reloaded.isApproved).toBe(true);
    });

    it('does not auto-approve a restaurant that was not auto-verified', async () => {
      const restaurant = await createTestRestaurant(); // default mock: not_attempted
      const restaurantId = restaurant._id.toString();
      const category = await menuService.createCategory(restaurantId, owner, {
        name: 'Mains',
      });

      await menuService.createItem(restaurantId, owner, {
        categoryId: category._id.toString(),
        name: 'Jollof Rice',
        price: 12,
      });

      const reloaded = await restaurantsService.findByIdOrThrow(restaurantId);
      expect(reloaded.isApproved).toBe(false);
    });

    it('still returns the created item even if the auto-approval check itself throws', async () => {
      const restaurant = await createTestRestaurant();
      const restaurantId = restaurant._id.toString();
      const category = await menuService.createCategory(restaurantId, owner, {
        name: 'Mains',
      });
      jest
        .spyOn(restaurantsService, 'autoApproveIfEligible')
        .mockRejectedValueOnce(new Error('boom'));

      const item = await menuService.createItem(restaurantId, owner, {
        categoryId: category._id.toString(),
        name: 'Jollof Rice',
        price: 12,
      });

      expect(item.name).toBe('Jollof Rice');
    });
  });
});
