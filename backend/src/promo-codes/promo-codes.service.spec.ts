import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { PromoCodesService } from './promo-codes.service';
import {
  PromoCode,
  PromoCodeDocument,
  PromoCodeSchema,
} from './schemas/promo-code.schema';
import { RestaurantsService } from '../restaurants/restaurants.service';
import {
  Restaurant,
  RestaurantDocument,
  RestaurantSchema,
} from '../restaurants/schemas/restaurant.schema';
import { StoresService } from '../stores/stores.service';
import {
  Store,
  StoreDocument,
  StoreSchema,
} from '../stores/schemas/store.schema';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';

jest.setTimeout(30_000);

describe('PromoCodesService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let service: PromoCodesService;
  let restaurantsService: RestaurantsService;
  let storesService: StoresService;
  let promoCodeModel: Model<PromoCodeDocument>;
  let restaurantModel: Model<RestaurantDocument>;
  let storeModel: Model<StoreDocument>;

  const admin: AccessTokenPayload = {
    sub: 'admin-id',
    email: 'admin@example.com',
    role: 'admin',
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
          { name: PromoCode.name, schema: PromoCodeSchema },
          { name: Restaurant.name, schema: RestaurantSchema },
          { name: Store.name, schema: StoreSchema },
        ]),
      ],
      providers: [PromoCodesService, RestaurantsService, StoresService],
    }).compile();

    service = moduleRef.get(PromoCodesService);
    restaurantsService = moduleRef.get(RestaurantsService);
    storesService = moduleRef.get(StoresService);
    promoCodeModel = moduleRef.get(getModelToken(PromoCode.name));
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    storeModel = moduleRef.get(getModelToken(Store.name));
  }, 60_000);

  afterEach(async () => {
    await Promise.all([
      promoCodeModel.deleteMany({}).exec(),
      restaurantModel.deleteMany({}).exec(),
      storeModel.deleteMany({}).exec(),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  const restaurantId = '507f1f77bcf86cd799439011';
  const otherRestaurantId = '507f1f77bcf86cd799439012';

  it('rejects an unknown code', async () => {
    const result = await service.validate(
      'NOPE',
      { sellerType: 'restaurant', sellerId: restaurantId },
      50,
    );
    expect(result).toEqual({ valid: false, reason: 'Invalid promo code' });
  });

  it('normalizes case when looking up a code', async () => {
    await service.create(
      {
        code: 'welcome10',
        discountType: 'percentage',
        discountValue: 10,
      },
      admin,
    );
    const result = await service.validate(
      'Welcome10',
      { sellerType: 'restaurant', sellerId: restaurantId },
      50,
    );
    expect(result.valid).toBe(true);
  });

  it('caps a percentage discount at maxDiscountAmount', async () => {
    await service.create(
      {
        code: 'BIG50',
        discountType: 'percentage',
        discountValue: 50,
        maxDiscountAmount: 10,
      },
      admin,
    );
    const result = await service.validate(
      'BIG50',
      { sellerType: 'restaurant', sellerId: restaurantId },
      100,
    ); // 50% of 100 = 50, capped to 10
    expect(result).toMatchObject({ valid: true, discountAmount: 10 });
  });

  it('applies a fixed discount, capped at the subtotal', async () => {
    await service.create(
      {
        code: 'FLAT20',
        discountType: 'fixed',
        discountValue: 20,
      },
      admin,
    );
    const smallOrder = await service.validate(
      'FLAT20',
      { sellerType: 'restaurant', sellerId: restaurantId },
      5,
    );
    expect(smallOrder).toMatchObject({ valid: true, discountAmount: 5 }); // can't discount more than the order

    const bigOrder = await service.validate(
      'FLAT20',
      { sellerType: 'restaurant', sellerId: restaurantId },
      100,
    );
    expect(bigOrder).toMatchObject({ valid: true, discountAmount: 20 });
  });

  it('rejects an order below minOrderAmount', async () => {
    await service.create(
      {
        code: 'MIN30',
        discountType: 'fixed',
        discountValue: 5,
        minOrderAmount: 30,
      },
      admin,
    );
    const result = await service.validate(
      'MIN30',
      { sellerType: 'restaurant', sellerId: restaurantId },
      20,
    );
    expect(result.valid).toBe(false);
  });

  it('rejects a code scoped to a different restaurant', async () => {
    await service.create(
      {
        code: 'SCOPED',
        discountType: 'fixed',
        discountValue: 5,
        restaurantId: otherRestaurantId,
      },
      admin,
    );
    const result = await service.validate(
      'SCOPED',
      { sellerType: 'restaurant', sellerId: restaurantId },
      50,
    );
    expect(result).toEqual({
      valid: false,
      reason: 'This promo code is not valid for this restaurant',
    });
  });

  it('accepts a restaurant-scoped code for the matching restaurant', async () => {
    await service.create(
      {
        code: 'SCOPED2',
        discountType: 'fixed',
        discountValue: 5,
        restaurantId,
      },
      admin,
    );
    const result = await service.validate(
      'SCOPED2',
      { sellerType: 'restaurant', sellerId: restaurantId },
      50,
    );
    expect(result.valid).toBe(true);
  });

  describe('store scoping (docs/ROADMAP.md FDP-90)', () => {
    const storeId = '507f1f77bcf86cd799439021';
    const otherStoreId = '507f1f77bcf86cd799439022';

    it('rejects a store-scoped code for a restaurant cart', async () => {
      await service.create(
        {
          code: 'STORESCOPED',
          discountType: 'fixed',
          discountValue: 5,
          storeId,
        },
        admin,
      );
      const result = await service.validate(
        'STORESCOPED',
        {
          sellerType: 'restaurant',
          sellerId: restaurantId,
        },
        50,
      );
      expect(result).toEqual({
        valid: false,
        reason: 'This promo code is not valid for this store',
      });
    });

    it('rejects a store-scoped code for a different store', async () => {
      await service.create(
        {
          code: 'STORESCOPED2',
          discountType: 'fixed',
          discountValue: 5,
          storeId,
        },
        admin,
      );
      const result = await service.validate(
        'STORESCOPED2',
        {
          sellerType: 'store',
          sellerId: otherStoreId,
        },
        50,
      );
      expect(result).toEqual({
        valid: false,
        reason: 'This promo code is not valid for this store',
      });
    });

    it('accepts a store-scoped code for the matching store', async () => {
      await service.create(
        {
          code: 'STORESCOPED3',
          discountType: 'fixed',
          discountValue: 5,
          storeId,
        },
        admin,
      );
      const result = await service.validate(
        'STORESCOPED3',
        {
          sellerType: 'store',
          sellerId: storeId,
        },
        50,
      );
      expect(result.valid).toBe(true);
    });

    it('accepts a platform-wide code (neither restaurantId nor storeId) for a store cart', async () => {
      await service.create(
        {
          code: 'PLATFORMWIDE',
          discountType: 'fixed',
          discountValue: 5,
        },
        admin,
      );
      const result = await service.validate(
        'PLATFORMWIDE',
        {
          sellerType: 'store',
          sellerId: storeId,
        },
        50,
      );
      expect(result.valid).toBe(true);
    });

    it('refuses to create a code scoped to both a restaurant and a store', async () => {
      await expect(
        service.create(
          {
            code: 'BOTHSCOPED',
            discountType: 'fixed',
            discountValue: 5,
            restaurantId,
            storeId,
          },
          admin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to update a restaurant-scoped code to also set storeId', async () => {
      const promo = await service.create(
        {
          code: 'RESCOPEME',
          discountType: 'fixed',
          discountValue: 5,
          restaurantId,
        },
        admin,
      );
      await expect(
        service.update(promo._id.toString(), { storeId }, admin),
      ).rejects.toThrow(BadRequestException);
    });
  });

  it('rejects an inactive code', async () => {
    await service.create(
      {
        code: 'OFF',
        discountType: 'fixed',
        discountValue: 5,
        isActive: false,
      },
      admin,
    );
    const result = await service.validate(
      'OFF',
      { sellerType: 'restaurant', sellerId: restaurantId },
      50,
    );
    expect(result.valid).toBe(false);
  });

  it('rejects an expired code', async () => {
    await service.create(
      {
        code: 'EXPIRED',
        discountType: 'fixed',
        discountValue: 5,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
      admin,
    );
    const result = await service.validate(
      'EXPIRED',
      { sellerType: 'restaurant', sellerId: restaurantId },
      50,
    );
    expect(result.valid).toBe(false);
  });

  it('rejects once usageLimit is reached, without redeem() being called', async () => {
    const promo = await service.create(
      {
        code: 'ONCE',
        discountType: 'fixed',
        discountValue: 5,
        usageLimit: 1,
      },
      admin,
    );

    const beforeRedeem = await service.validate(
      'ONCE',
      { sellerType: 'restaurant', sellerId: restaurantId },
      50,
    );
    expect(beforeRedeem.valid).toBe(true);

    await service.redeem(promo._id.toString());

    const afterRedeem = await service.validate(
      'ONCE',
      { sellerType: 'restaurant', sellerId: restaurantId },
      50,
    );
    expect(afterRedeem).toEqual({
      valid: false,
      reason: 'This promo code has reached its usage limit',
    });
  });

  it('redeem() is atomic under a concurrent race — usedCount can never exceed usageLimit (docs/ROADMAP.md FDP-109)', async () => {
    const promo = await service.create(
      {
        code: 'RACE',
        discountType: 'fixed',
        discountValue: 5,
        usageLimit: 1,
      },
      admin,
    );

    // Both requests already passed validate() while the code had exactly one redemption left
    // (the actual race this codebase hit — validate() and redeem() aren't atomic with each
    // other) — this asserts the increment itself, not the earlier read, is what's race-safe.
    const [first, second] = await Promise.all([
      service.redeem(promo._id.toString()),
      service.redeem(promo._id.toString()),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    const reloaded = await promoCodeModel.findById(promo._id).exec();
    expect(reloaded?.usedCount).toBe(1);
  });

  it('redeem() returns true and increments when under the limit', async () => {
    const promo = await service.create(
      {
        code: 'ROOM',
        discountType: 'fixed',
        discountValue: 5,
        usageLimit: 2,
      },
      admin,
    );

    const redeemed = await service.redeem(promo._id.toString());

    expect(redeemed).toBe(true);
    const reloaded = await promoCodeModel.findById(promo._id).exec();
    expect(reloaded?.usedCount).toBe(1);
  });

  it('redeem() returns false and does not increment once the limit is already reached', async () => {
    const promo = await service.create(
      {
        code: 'FULL',
        discountType: 'fixed',
        discountValue: 5,
        usageLimit: 1,
      },
      admin,
    );
    await service.redeem(promo._id.toString());

    const redeemed = await service.redeem(promo._id.toString());

    expect(redeemed).toBe(false);
    const reloaded = await promoCodeModel.findById(promo._id).exec();
    expect(reloaded?.usedCount).toBe(1);
  });

  it('redeem() has no limit (always returns true) for a promo code with usageLimit null', async () => {
    const promo = await service.create(
      {
        code: 'UNLIMITED',
        discountType: 'fixed',
        discountValue: 5,
      },
      admin,
    );

    const redeemed = await service.redeem(promo._id.toString());

    expect(redeemed).toBe(true);
  });

  it('validate() alone does not increment usedCount', async () => {
    const promo = await service.create(
      {
        code: 'READONLY',
        discountType: 'fixed',
        discountValue: 5,
      },
      admin,
    );
    await service.validate(
      'READONLY',
      { sellerType: 'restaurant', sellerId: restaurantId },
      50,
    );
    await service.validate(
      'READONLY',
      { sellerType: 'restaurant', sellerId: restaurantId },
      50,
    );
    const stored = await promoCodeModel.findById(promo._id).exec();
    expect(stored?.usedCount).toBe(0);
  });

  describe('update', () => {
    it('deactivates a code — a since-deactivated code then fails validate()', async () => {
      const promo = await service.create(
        {
          code: 'DEACTIVATE',
          discountType: 'fixed',
          discountValue: 5,
        },
        admin,
      );

      const updated = await service.update(
        promo._id.toString(),
        { isActive: false },
        admin,
      );
      expect(updated.isActive).toBe(false);

      const result = await service.validate(
        'DEACTIVATE',
        { sellerType: 'restaurant', sellerId: restaurantId },
        50,
      );
      expect(result).toEqual({
        valid: false,
        reason: 'This promo code is no longer active',
      });
    });

    it('leaves fields not present in the DTO untouched', async () => {
      const promo = await service.create(
        {
          code: 'PARTIAL',
          discountType: 'fixed',
          discountValue: 5,
          usageLimit: 10,
        },
        admin,
      );

      const updated = await service.update(
        promo._id.toString(),
        { discountValue: 8 },
        admin,
      );
      expect(updated.discountValue).toBe(8);
      expect(updated.usageLimit).toBe(10);
    });

    it('throws NotFoundException for an unknown id', async () => {
      await expect(
        service.update('507f1f77bcf86cd799439099', { isActive: false }, admin),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('vendor-created promo codes (docs/ROADMAP.md FDP-111)', () => {
    async function createOwnedRestaurant(ownerId: string) {
      const restaurant = await restaurantsService.create(ownerId, {
        name: 'Burgundy Kitchen',
        cuisineTypes: ['Nigerian'],
        currency: 'NGN',
        country: 'Nigeria',
        address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
        complianceDocumentUrl: 'https://example.com/doc.pdf',
      });
      return restaurantsService.approve(restaurant._id.toString());
    }

    async function createOwnedStore(ownerId: string) {
      const store = await storesService.create(ownerId, {
        name: 'Market Square Supermarket',
        type: 'groceries',
        currency: 'NGN',
        country: 'Nigeria',
        address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
        complianceDocumentUrl: 'https://example.com/doc.pdf',
      });
      return storesService.approve(store._id.toString());
    }

    it('lets a vendor create a code scoped to their own restaurant', async () => {
      const owner: AccessTokenPayload = {
        sub: 'owner-1',
        email: 'owner1@example.com',
        role: 'restaurant_owner',
      };
      const restaurant = await createOwnedRestaurant(owner.sub);

      const promo = await service.create(
        {
          code: 'MYCODE',
          discountType: 'fixed',
          discountValue: 5,
          restaurantId: restaurant._id.toString(),
        },
        owner,
      );

      expect(promo.restaurantId?.toString()).toBe(restaurant._id.toString());
    });

    it('lets a vendor create a code scoped to their own store', async () => {
      const owner: AccessTokenPayload = {
        sub: 'owner-2',
        email: 'owner2@example.com',
        role: 'restaurant_owner',
      };
      const store = await createOwnedStore(owner.sub);

      const promo = await service.create(
        {
          code: 'MYSTORECODE',
          discountType: 'fixed',
          discountValue: 5,
          storeId: store._id.toString(),
        },
        owner,
      );

      expect(promo.storeId?.toString()).toBe(store._id.toString());
    });

    it('rejects a vendor creating a platform-wide code (neither restaurantId nor storeId)', async () => {
      const owner: AccessTokenPayload = {
        sub: 'owner-3',
        email: 'owner3@example.com',
        role: 'restaurant_owner',
      };

      await expect(
        service.create(
          { code: 'NOSCOPE', discountType: 'fixed', discountValue: 5 },
          owner,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects a vendor creating a code scoped to a restaurant they don't own", async () => {
      const someoneElse: AccessTokenPayload = {
        sub: 'owner-4',
        email: 'owner4@example.com',
        role: 'restaurant_owner',
      };
      const stranger: AccessTokenPayload = {
        sub: 'stranger-1',
        email: 'stranger1@example.com',
        role: 'restaurant_owner',
      };
      const restaurant = await createOwnedRestaurant(someoneElse.sub);

      await expect(
        service.create(
          {
            code: 'NOTMINE',
            discountType: 'fixed',
            discountValue: 5,
            restaurantId: restaurant._id.toString(),
          },
          stranger,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('findMine returns only codes scoped to restaurants/stores this vendor owns', async () => {
      const owner: AccessTokenPayload = {
        sub: 'owner-5',
        email: 'owner5@example.com',
        role: 'restaurant_owner',
      };
      const someoneElse: AccessTokenPayload = {
        sub: 'owner-6',
        email: 'owner6@example.com',
        role: 'restaurant_owner',
      };
      const myRestaurant = await createOwnedRestaurant(owner.sub);
      const myStore = await createOwnedStore(owner.sub);
      const theirRestaurant = await createOwnedRestaurant(someoneElse.sub);

      await service.create(
        {
          code: 'MINE1',
          discountType: 'fixed',
          discountValue: 5,
          restaurantId: myRestaurant._id.toString(),
        },
        owner,
      );
      await service.create(
        {
          code: 'MINE2',
          discountType: 'fixed',
          discountValue: 5,
          storeId: myStore._id.toString(),
        },
        owner,
      );
      await service.create(
        {
          code: 'THEIRS',
          discountType: 'fixed',
          discountValue: 5,
          restaurantId: theirRestaurant._id.toString(),
        },
        someoneElse,
      );
      await service.create(
        { code: 'PLATFORMONE', discountType: 'fixed', discountValue: 5 },
        admin,
      );

      const mine = await service.findMine(owner);

      expect(mine.map((p) => p.code).sort()).toEqual(['MINE1', 'MINE2']);
    });

    it('lets a vendor update (e.g. deactivate) their own code', async () => {
      const owner: AccessTokenPayload = {
        sub: 'owner-7',
        email: 'owner7@example.com',
        role: 'restaurant_owner',
      };
      const restaurant = await createOwnedRestaurant(owner.sub);
      const promo = await service.create(
        {
          code: 'VENDORDEACTIVATE',
          discountType: 'fixed',
          discountValue: 5,
          restaurantId: restaurant._id.toString(),
        },
        owner,
      );

      const updated = await service.update(
        promo._id.toString(),
        { isActive: false },
        owner,
      );

      expect(updated.isActive).toBe(false);
    });

    it("rejects a vendor updating another vendor's code", async () => {
      const owner: AccessTokenPayload = {
        sub: 'owner-8',
        email: 'owner8@example.com',
        role: 'restaurant_owner',
      };
      const stranger: AccessTokenPayload = {
        sub: 'stranger-2',
        email: 'stranger2@example.com',
        role: 'restaurant_owner',
      };
      const restaurant = await createOwnedRestaurant(owner.sub);
      const promo = await service.create(
        {
          code: 'NOTYOURS',
          discountType: 'fixed',
          discountValue: 5,
          restaurantId: restaurant._id.toString(),
        },
        owner,
      );

      await expect(
        service.update(promo._id.toString(), { isActive: false }, stranger),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a vendor trying to reassign a code to a different restaurant', async () => {
      const owner: AccessTokenPayload = {
        sub: 'owner-9',
        email: 'owner9@example.com',
        role: 'restaurant_owner',
      };
      const restaurant = await createOwnedRestaurant(owner.sub);
      const otherRestaurant = await createOwnedRestaurant(owner.sub);
      const promo = await service.create(
        {
          code: 'NOREASSIGN',
          discountType: 'fixed',
          discountValue: 5,
          restaurantId: restaurant._id.toString(),
        },
        owner,
      );

      await expect(
        service.update(
          promo._id.toString(),
          { restaurantId: otherRestaurant._id.toString() },
          owner,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll — admin scope enrichment (docs/ROADMAP.md FDP-112)', () => {
    async function createOwnedRestaurant(ownerId: string, name: string) {
      const restaurant = await restaurantsService.create(ownerId, {
        name,
        cuisineTypes: ['Nigerian'],
        currency: 'NGN',
        country: 'Nigeria',
        address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
        complianceDocumentUrl: 'https://example.com/doc.pdf',
      });
      return restaurantsService.approve(restaurant._id.toString());
    }

    async function createOwnedStore(ownerId: string, name: string) {
      const store = await storesService.create(ownerId, {
        name,
        type: 'groceries',
        currency: 'NGN',
        country: 'Nigeria',
        address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
        complianceDocumentUrl: 'https://example.com/doc.pdf',
      });
      return storesService.approve(store._id.toString());
    }

    it('reports scope: platform for a platform-wide code', async () => {
      await service.create(
        { code: 'ENRICH1', discountType: 'fixed', discountValue: 5 },
        admin,
      );

      const all = await service.findAll();

      expect(all.find((p) => p.code === 'ENRICH1')?.scope).toEqual({
        type: 'platform',
      });
    });

    it("reports scope: restaurant with the restaurant's name", async () => {
      const restaurant = await createOwnedRestaurant(
        'owner-enrich-1',
        'Burgundy Kitchen',
      );
      await service.create(
        {
          code: 'ENRICH2',
          discountType: 'fixed',
          discountValue: 5,
          restaurantId: restaurant._id.toString(),
        },
        admin,
      );

      const all = await service.findAll();

      expect(all.find((p) => p.code === 'ENRICH2')?.scope).toEqual({
        type: 'restaurant',
        id: restaurant._id.toString(),
        name: 'Burgundy Kitchen',
      });
    });

    it("reports scope: store with the store's name", async () => {
      const store = await createOwnedStore(
        'owner-enrich-2',
        'Market Square Supermarket',
      );
      await service.create(
        {
          code: 'ENRICH3',
          discountType: 'fixed',
          discountValue: 5,
          storeId: store._id.toString(),
        },
        admin,
      );

      const all = await service.findAll();

      expect(all.find((p) => p.code === 'ENRICH3')?.scope).toEqual({
        type: 'store',
        id: store._id.toString(),
        name: 'Market Square Supermarket',
      });
    });

    it('reports scope: platform (not a crash) for a legacy code whose restaurantId/storeId is genuinely undefined, not null (docs/ROADMAP.md FDP-114) — a real production bug', async () => {
      // Bypasses the DTO/service entirely to simulate a promo code predating these fields (or
      // written directly), same "legacy data" reasoning as the rider/restaurant/store payout
      // fixture bugs above. `undefined !== null` is `true` in JS — the old `!== null` check
      // wrongly treated this as restaurant-scoped and crashed calling `.toString()` on
      // `undefined`, surfacing to the admin UI as "Cannot read properties of undefined
      // (reading 'type')" once the whole request failed.
      await promoCodeModel.collection.insertOne({
        code: 'LEGACY1',
        discountType: 'fixed',
        discountValue: 5,
        minOrderAmount: 0,
        maxDiscountAmount: null,
        expiresAt: null,
        isActive: true,
        usageLimit: null,
        usedCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        // restaurantId/storeId deliberately absent — never written at all.
      });

      const all = await service.findAll();

      expect(all.find((p) => p.code === 'LEGACY1')?.scope).toEqual({
        type: 'platform',
      });
    });

    it('validate() also treats the same legacy code as platform-wide instead of crashing (docs/ROADMAP.md FDP-114)', async () => {
      await promoCodeModel.collection.insertOne({
        code: 'LEGACY2',
        discountType: 'fixed',
        discountValue: 5,
        minOrderAmount: 0,
        maxDiscountAmount: null,
        expiresAt: null,
        isActive: true,
        usageLimit: null,
        usedCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.validate(
        'LEGACY2',
        { sellerType: 'restaurant', sellerId: restaurantId },
        50,
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('findActiveForSeller (docs/ROADMAP.md FDP-112)', () => {
    const storeId = '507f1f77bcf86cd799439031';

    it('includes a platform-wide active code for any seller', async () => {
      await service.create(
        { code: 'BANNER1', discountType: 'fixed', discountValue: 5 },
        admin,
      );

      const active = await service.findActiveForSeller({
        sellerType: 'restaurant',
        sellerId: restaurantId,
      });

      expect(active.map((p) => p.code)).toContain('BANNER1');
    });

    it('includes a code scoped to this exact restaurant, excludes one scoped to a different one', async () => {
      await service.create(
        {
          code: 'BANNER2',
          discountType: 'fixed',
          discountValue: 5,
          restaurantId,
        },
        admin,
      );
      await service.create(
        {
          code: 'BANNER3',
          discountType: 'fixed',
          discountValue: 5,
          restaurantId: otherRestaurantId,
        },
        admin,
      );

      const active = await service.findActiveForSeller({
        sellerType: 'restaurant',
        sellerId: restaurantId,
      });

      const codes = active.map((p) => p.code);
      expect(codes).toContain('BANNER2');
      expect(codes).not.toContain('BANNER3');
    });

    it('excludes an inactive code', async () => {
      await service.create(
        {
          code: 'BANNER4',
          discountType: 'fixed',
          discountValue: 5,
          isActive: false,
        },
        admin,
      );

      const active = await service.findActiveForSeller({
        sellerType: 'store',
        sellerId: storeId,
      });

      expect(active.map((p) => p.code)).not.toContain('BANNER4');
    });

    it('excludes an expired code', async () => {
      await service.create(
        {
          code: 'BANNER5',
          discountType: 'fixed',
          discountValue: 5,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
        admin,
      );

      const active = await service.findActiveForSeller({
        sellerType: 'store',
        sellerId: storeId,
      });

      expect(active.map((p) => p.code)).not.toContain('BANNER5');
    });

    it('excludes a code that has reached its usage limit', async () => {
      const promo = await service.create(
        {
          code: 'BANNER6',
          discountType: 'fixed',
          discountValue: 5,
          usageLimit: 1,
        },
        admin,
      );
      await service.redeem(promo._id.toString());

      const active = await service.findActiveForSeller({
        sellerType: 'store',
        sellerId: storeId,
      });

      expect(active.map((p) => p.code)).not.toContain('BANNER6');
    });

    it('excludes a restaurant-scoped code from a store seller and vice versa', async () => {
      await service.create(
        {
          code: 'BANNER7',
          discountType: 'fixed',
          discountValue: 5,
          restaurantId,
        },
        admin,
      );

      const active = await service.findActiveForSeller({
        sellerType: 'store',
        sellerId: storeId,
      });

      expect(active.map((p) => p.code)).not.toContain('BANNER7');
    });
  });
});
