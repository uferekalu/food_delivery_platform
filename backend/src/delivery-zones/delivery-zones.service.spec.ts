import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { DeliveryZonesService } from './delivery-zones.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import {
  Restaurant,
  RestaurantDocument,
  RestaurantSchema,
} from '../restaurants/schemas/restaurant.schema';
import {
  DeliveryZone,
  DeliveryZoneDocument,
  DeliveryZoneSchema,
} from './schemas/delivery-zone.schema';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';

jest.setTimeout(30_000);

describe('DeliveryZonesService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let deliveryZonesService: DeliveryZonesService;
  let restaurantsService: RestaurantsService;
  let restaurantModel: Model<RestaurantDocument>;
  let zoneModel: Model<DeliveryZoneDocument>;

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
          { name: DeliveryZone.name, schema: DeliveryZoneSchema },
        ]),
      ],
      providers: [DeliveryZonesService, RestaurantsService],
    }).compile();

    deliveryZonesService = moduleRef.get(DeliveryZonesService);
    restaurantsService = moduleRef.get(RestaurantsService);
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    zoneModel = moduleRef.get(getModelToken(DeliveryZone.name));
  }, 60_000);

  afterEach(async () => {
    await Promise.all([
      restaurantModel.deleteMany({}).exec(),
      zoneModel.deleteMany({}).exec(),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  async function createTestRestaurant(
    address: {
      line1: string;
      city: string;
      state: string;
      lat?: number;
      lng?: number;
    } = { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
  ) {
    return restaurantsService.create(owner.sub, {
      name: 'Burgundy Kitchen',
      cuisineTypes: ['Nigerian'],
      currency: 'NGN',
      country: 'Nigeria',
      address,
    });
  }

  it('creates, lists, updates, and deletes zones for the owner', async () => {
    const restaurant = await createTestRestaurant();
    const zone = await deliveryZonesService.create(
      restaurant._id.toString(),
      owner,
      { name: 'Nearby', maxDistanceKm: 5, baseFee: 300, perKmFee: 50 },
    );
    expect(zone.name).toBe('Nearby');

    const list = await deliveryZonesService.list(
      restaurant._id.toString(),
      owner,
    );
    expect(list).toHaveLength(1);

    const updated = await deliveryZonesService.update(
      restaurant._id.toString(),
      zone._id.toString(),
      owner,
      { baseFee: 400 },
    );
    expect(updated.baseFee).toBe(400);

    await deliveryZonesService.delete(
      restaurant._id.toString(),
      zone._id.toString(),
      owner,
    );
    const afterDelete = await deliveryZonesService.list(
      restaurant._id.toString(),
      owner,
    );
    expect(afterDelete).toHaveLength(0);
  });

  it('rejects a stranger from listing, creating, updating, or deleting zones', async () => {
    const restaurant = await createTestRestaurant();
    const zone = await deliveryZonesService.create(
      restaurant._id.toString(),
      owner,
      { name: 'Nearby', maxDistanceKm: 5, baseFee: 300, perKmFee: 50 },
    );

    await expect(
      deliveryZonesService.list(restaurant._id.toString(), stranger),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      deliveryZonesService.create(restaurant._id.toString(), stranger, {
        name: 'Intrusion',
        maxDistanceKm: 5,
        baseFee: 100,
        perKmFee: 10,
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      deliveryZonesService.update(
        restaurant._id.toString(),
        zone._id.toString(),
        stranger,
        { baseFee: 999 },
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      deliveryZonesService.delete(
        restaurant._id.toString(),
        zone._id.toString(),
        stranger,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException updating/deleting a zone that does not belong to the restaurant', async () => {
    const restaurant = await createTestRestaurant();
    const other = await createTestRestaurant();
    const zone = await deliveryZonesService.create(
      restaurant._id.toString(),
      owner,
      { name: 'Nearby', maxDistanceKm: 5, baseFee: 300, perKmFee: 50 },
    );

    await expect(
      deliveryZonesService.update(
        other._id.toString(),
        zone._id.toString(),
        owner,
        { baseFee: 1 },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  describe('calculateFee', () => {
    it('falls back to the flat rate when the restaurant has no coordinates', async () => {
      const restaurant = await createTestRestaurant();
      await deliveryZonesService.create(restaurant._id.toString(), owner, {
        name: 'Nearby',
        maxDistanceKm: 20,
        baseFee: 300,
        perKmFee: 50,
      });

      const fee = await deliveryZonesService.calculateFee(
        restaurant,
        { line1: 'x', city: 'x', state: 'x', lat: 6.5, lng: 3.4 },
        200,
      );
      expect(fee).toBe(20); // 10% of 200
    });

    it('falls back to the flat rate when there are no zones at all', async () => {
      const restaurant = await createTestRestaurant({
        line1: '1 Main St',
        city: 'Lagos',
        state: 'Lagos',
        lat: 6.5,
        lng: 3.4,
      });

      const fee = await deliveryZonesService.calculateFee(
        restaurant,
        { line1: 'x', city: 'x', state: 'x', lat: 6.501, lng: 3.4 },
        200,
      );
      expect(fee).toBe(20);
    });

    it('uses the matching zone baseFee + perKmFee*distance when coordinates and a zone are present', async () => {
      const restaurant = await createTestRestaurant({
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

      const fee = await deliveryZonesService.calculateFee(
        restaurant,
        {
          line1: 'x',
          city: 'x',
          state: 'x',
          lat: 6.545, // ~5km away, same longitude
          lng: 3.3792,
        },
        200,
      );
      expect(fee).toBeGreaterThan(300);
      expect(fee).not.toBe(20);
    });

    it('picks the narrowest covering zone when multiple zones overlap', async () => {
      const restaurant = await createTestRestaurant({
        line1: '1 Main St',
        city: 'Lagos',
        state: 'Lagos',
        lat: 6.5,
        lng: 3.3792,
      });
      await deliveryZonesService.create(restaurant._id.toString(), owner, {
        name: 'Far',
        maxDistanceKm: 50,
        baseFee: 1000,
        perKmFee: 0,
      });
      await deliveryZonesService.create(restaurant._id.toString(), owner, {
        name: 'Near',
        maxDistanceKm: 10,
        baseFee: 100,
        perKmFee: 0,
      });

      const fee = await deliveryZonesService.calculateFee(
        restaurant,
        { line1: 'x', city: 'x', state: 'x', lat: 6.545, lng: 3.3792 }, // ~5km, inside both
        200,
      );
      expect(fee).toBe(100); // the narrower "Near" zone wins, not "Far"
    });
  });
});
