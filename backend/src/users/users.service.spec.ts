import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { UsersService } from './users.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import {
  Restaurant,
  RestaurantDocument,
  RestaurantSchema,
} from '../restaurants/schemas/restaurant.schema';
import {
  RefreshToken,
  RefreshTokenDocument,
  RefreshTokenSchema,
} from '../auth/schemas/refresh-token.schema';
import { User, UserDocument, UserSchema } from './schemas/user.schema';

jest.setTimeout(30_000);

describe('UsersService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let usersService: UsersService;
  let restaurantsService: RestaurantsService;
  let userModel: Model<UserDocument>;
  let restaurantModel: Model<RestaurantDocument>;
  let refreshTokenModel: Model<RefreshTokenDocument>;

  beforeAll(async () => {
    // See backend/CLAUDE.md ("Testing") for why launchTimeout is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: Restaurant.name, schema: RestaurantSchema },
          { name: RefreshToken.name, schema: RefreshTokenSchema },
        ]),
      ],
      providers: [UsersService, RestaurantsService],
    }).compile();

    usersService = moduleRef.get(UsersService);
    restaurantsService = moduleRef.get(RestaurantsService);
    userModel = moduleRef.get(getModelToken(User.name));
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    refreshTokenModel = moduleRef.get(getModelToken(RefreshToken.name));
  }, 60_000);

  afterEach(async () => {
    await Promise.all([
      userModel.deleteMany({}).exec(),
      restaurantModel.deleteMany({}).exec(),
      refreshTokenModel.deleteMany({}).exec(),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  async function createUser() {
    return userModel.create({
      email: 'jane@example.com',
      passwordHash: 'irrelevant',
      name: 'Jane Doe',
      role: 'customer',
    });
  }

  async function createRestaurant(name = 'Burgundy Kitchen') {
    return restaurantsService.create('owner-id', {
      name,
      cuisineTypes: ['Nigerian'],
      currency: 'NGN',
      country: 'Nigeria',
      complianceDocumentUrl: 'https://example.com/doc.pdf',
      address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
    });
  }

  describe('updateProfile', () => {
    it('updates name and avatarUrl', async () => {
      const user = await createUser();
      const updated = await usersService.updateProfile(user._id.toString(), {
        name: 'Jane Smith',
        avatarUrl: 'https://res.cloudinary.com/demo/avatar.png',
      });
      expect(updated.name).toBe('Jane Smith');
      expect(updated.avatarUrl).toBe(
        'https://res.cloudinary.com/demo/avatar.png',
      );
    });

    it('leaves fields untouched when omitted', async () => {
      const user = await createUser();
      const updated = await usersService.updateProfile(user._id.toString(), {});
      expect(updated.name).toBe('Jane Doe');
    });
  });

  describe('saved addresses', () => {
    const address = { line1: '1 Test St', city: 'Lagos', state: 'Lagos' };

    it('makes the first address the default automatically', async () => {
      const user = await createUser();
      const saved = await usersService.addAddress(user._id.toString(), {
        label: 'Home',
        address,
      });
      expect(saved.isDefault).toBe(true);
    });

    it('clears the previous default when a new address is added as default', async () => {
      const user = await createUser();
      const id = user._id.toString();
      const home = await usersService.addAddress(id, {
        label: 'Home',
        address,
      });
      await usersService.addAddress(id, {
        label: 'Work',
        address,
        isDefault: true,
      });

      const list = await usersService.listAddresses(id);
      const refreshedHome = list.find(
        (a) => a._id.toString() === home._id.toString(),
      );
      expect(refreshedHome?.isDefault).toBe(false);
      expect(list.find((a) => a.label === 'Work')?.isDefault).toBe(true);
    });

    it('does not allow unsetting the only default', async () => {
      const user = await createUser();
      const id = user._id.toString();
      const home = await usersService.addAddress(id, {
        label: 'Home',
        address,
      });

      const updated = await usersService.updateAddress(
        id,
        home._id.toString(),
        {
          isDefault: false,
        },
      );
      expect(updated.isDefault).toBe(true);
    });

    it('promotes another address to default when the default is removed', async () => {
      const user = await createUser();
      const id = user._id.toString();
      const home = await usersService.addAddress(id, {
        label: 'Home',
        address,
      });
      await usersService.addAddress(id, { label: 'Work', address });

      await usersService.removeAddress(id, home._id.toString());

      const list = await usersService.listAddresses(id);
      expect(list).toHaveLength(1);
      expect(list[0].isDefault).toBe(true);
    });

    it('throws for an unknown address id', async () => {
      const user = await createUser();
      await expect(
        usersService.updateAddress(user._id.toString(), user._id.toString(), {
          label: 'Nope',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('favorites', () => {
    it('adds and lists a favorite restaurant', async () => {
      const user = await createUser();
      const restaurant = await createRestaurant();
      await usersService.addFavorite(
        user._id.toString(),
        restaurant._id.toString(),
      );

      const favorites = await usersService.listFavorites(user._id.toString());
      expect(favorites).toHaveLength(1);
      expect(favorites[0]._id.toString()).toBe(restaurant._id.toString());
    });

    it('is idempotent — favoriting the same restaurant twice does not duplicate it', async () => {
      const user = await createUser();
      const restaurant = await createRestaurant();
      const id = user._id.toString();
      await usersService.addFavorite(id, restaurant._id.toString());
      await usersService.addFavorite(id, restaurant._id.toString());

      const favorites = await usersService.listFavorites(id);
      expect(favorites).toHaveLength(1);
    });

    it('removes a favorite', async () => {
      const user = await createUser();
      const restaurant = await createRestaurant();
      const id = user._id.toString();
      await usersService.addFavorite(id, restaurant._id.toString());
      await usersService.removeFavorite(id, restaurant._id.toString());

      expect(await usersService.listFavorites(id)).toHaveLength(0);
    });

    it('rejects favoriting a restaurant that does not exist', async () => {
      const user = await createUser();
      await expect(
        usersService.addFavorite(user._id.toString(), user._id.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listAll', () => {
    it('paginates and filters by role/status/search', async () => {
      await createUser(); // customer, Jane Doe
      const owner = await userModel.create({
        email: 'owner@example.com',
        passwordHash: 'irrelevant',
        name: 'Restaurant Owner',
        role: 'restaurant_owner',
      });
      await usersService.suspend(
        owner._id.toString(),
        'someone-else',
        'Fraud reported by a customer',
      );

      const byRole = await usersService.listAll({
        role: 'restaurant_owner',
        page: 1,
        limit: 20,
      });
      expect(byRole.items).toHaveLength(1);
      expect(byRole.items[0].email).toBe('owner@example.com');

      const byStatus = await usersService.listAll({
        status: 'suspended',
        page: 1,
        limit: 20,
      });
      expect(byStatus.total).toBe(1);
      expect(byStatus.items[0].status).toBe('suspended');

      const bySearch = await usersService.listAll({
        search: 'jane',
        page: 1,
        limit: 20,
      });
      expect(bySearch.items).toHaveLength(1);
      expect(bySearch.items[0].name).toBe('Jane Doe');
    });
  });

  describe('suspend/reactivate', () => {
    async function createRefreshTokenFor(userId: string) {
      return refreshTokenModel.create({
        userId,
        tokenHash: `hash-${Math.random()}`,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
    }

    it('suspends a user, records the reason, and revokes every outstanding refresh token', async () => {
      const user = await createUser();
      const token = await createRefreshTokenFor(user._id.toString());

      const suspended = await usersService.suspend(
        user._id.toString(),
        'admin-id',
        'Repeated policy violations',
      );
      expect(suspended.status).toBe('suspended');
      expect(suspended.suspendedReason).toBe('Repeated policy violations');
      expect(suspended.suspendedAt).toBeInstanceOf(Date);

      const refreshed = await refreshTokenModel.findById(token._id).exec();
      expect(refreshed?.revokedAt).not.toBeNull();
    });

    it('refuses to let an admin suspend their own account', async () => {
      const user = await createUser();
      await expect(
        usersService.suspend(
          user._id.toString(),
          user._id.toString(),
          'Testing',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to suspend an already-suspended account', async () => {
      const user = await createUser();
      await usersService.suspend(
        user._id.toString(),
        'admin-id',
        'First reason',
      );
      await expect(
        usersService.suspend(user._id.toString(), 'admin-id', 'Second reason'),
      ).rejects.toThrow(BadRequestException);
    });

    it('reactivates a suspended user, clearing the suspension fields', async () => {
      const user = await createUser();
      await usersService.suspend(user._id.toString(), 'admin-id', 'Reason');

      const reactivated = await usersService.reactivate(user._id.toString());
      expect(reactivated.status).toBe('active');
      expect(reactivated.suspendedAt).toBeNull();
      expect(reactivated.suspendedReason).toBeNull();
    });

    it('refuses to reactivate an account that is not suspended', async () => {
      const user = await createUser();
      await expect(
        usersService.reactivate(user._id.toString()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('countByRole', () => {
    it('counts every role, including roles with zero users', async () => {
      await createUser(); // customer
      await userModel.create({
        email: 'owner@example.com',
        passwordHash: 'irrelevant',
        name: 'An Owner',
        role: 'restaurant_owner',
      });

      const counts = await usersService.countByRole();
      expect(counts).toEqual({
        customer: 1,
        restaurant_owner: 1,
        rider: 0,
        admin: 0,
      });
    });
  });
});
