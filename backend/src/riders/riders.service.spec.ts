import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { RidersService } from './riders.service';
import { UsersService } from '../users/users.service';
import { User, UserDocument, UserSchema } from '../users/schemas/user.schema';
import { RestaurantsService } from '../restaurants/restaurants.service';
import {
  Restaurant,
  RestaurantSchema,
} from '../restaurants/schemas/restaurant.schema';
import { Rider, RiderDocument, RiderSchema } from './schemas/rider.schema';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';

jest.setTimeout(30_000);

describe('RidersService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let ridersService: RidersService;
  let usersService: UsersService;
  let riderModel: Model<RiderDocument>;
  let userModel: Model<UserDocument>;

  beforeAll(async () => {
    // See backend/CLAUDE.md ("Testing") for why launchTimeout is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Rider.name, schema: RiderSchema },
          { name: User.name, schema: UserSchema },
          { name: Restaurant.name, schema: RestaurantSchema },
        ]),
      ],
      providers: [RidersService, UsersService, RestaurantsService],
    }).compile();

    ridersService = moduleRef.get(RidersService);
    usersService = moduleRef.get(UsersService);
    riderModel = moduleRef.get(getModelToken(Rider.name));
    userModel = moduleRef.get(getModelToken(User.name));
  }, 60_000);

  afterEach(async () => {
    await Promise.all([
      riderModel.deleteMany({}).exec(),
      userModel.deleteMany({}).exec(),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  async function createCustomer(): Promise<UserDocument> {
    return userModel.create({
      email: `customer-${Math.random().toString(36).slice(2, 8)}@example.com`,
      passwordHash: 'hashed',
      name: 'Test Customer',
      role: 'customer',
    });
  }

  function requesterFor(user: UserDocument): AccessTokenPayload {
    return { sub: user._id.toString(), email: user.email, role: user.role };
  }

  it('apply creates a Rider profile and promotes the user role', async () => {
    const customer = await createCustomer();
    const rider = await ridersService.apply(requesterFor(customer), {
      vehicleType: 'motorcycle',
    });

    expect(rider.userId.toString()).toBe(customer._id.toString());
    expect(rider.vehicleType).toBe('motorcycle');
    expect(rider.isOnline).toBe(false);
    expect(rider.isVerified).toBe(false);

    const promoted = await usersService.findById(customer._id.toString());
    expect(promoted?.role).toBe('rider');
  });

  it('apply rejects a second application from the same user', async () => {
    const customer = await createCustomer();
    await ridersService.apply(requesterFor(customer), {
      vehicleType: 'bicycle',
    });

    await expect(
      ridersService.apply(
        { sub: customer._id.toString(), email: customer.email, role: 'rider' },
        { vehicleType: 'car' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('apply rejects an already-rider or admin requester without touching the database', async () => {
    const customer = await createCustomer();
    await expect(
      ridersService.apply(
        { sub: customer._id.toString(), email: customer.email, role: 'admin' },
        { vehicleType: 'car' },
      ),
    ).rejects.toThrow(BadRequestException);

    const count = await riderModel.countDocuments().exec();
    expect(count).toBe(0);
  });

  it('apply rejects a restaurant_owner — becoming a rider would overwrite their role and lock them out of their own restaurant dashboard', async () => {
    const owner = await createCustomer();
    await usersService.updateRole(owner._id.toString(), 'restaurant_owner');

    await expect(
      ridersService.apply(
        {
          sub: owner._id.toString(),
          email: owner.email,
          role: 'restaurant_owner',
        },
        { vehicleType: 'car' },
      ),
    ).rejects.toThrow(BadRequestException);

    const count = await riderModel.countDocuments().exec();
    expect(count).toBe(0);
    const stillOwner = await usersService.findById(owner._id.toString());
    expect(stillOwner?.role).toBe('restaurant_owner'); // untouched
  });

  it('toggleOnline flips isOnline back and forth', async () => {
    const customer = await createCustomer();
    await ridersService.apply(requesterFor(customer), {
      vehicleType: 'car',
    });

    const first = await ridersService.toggleOnline(customer._id.toString());
    expect(first.isOnline).toBe(true);

    const second = await ridersService.toggleOnline(customer._id.toString());
    expect(second.isOnline).toBe(false);
  });

  it('findMine throws NotFoundException for a user with no rider profile', async () => {
    const customer = await createCustomer();
    await expect(
      ridersService.findMine(customer._id.toString()),
    ).rejects.toThrow(NotFoundException);
  });

  it('verify sets isVerified, findAll lists riders', async () => {
    const customer = await createCustomer();
    const rider = await ridersService.apply(requesterFor(customer), {
      vehicleType: 'van',
    });
    expect(rider.isVerified).toBe(false);

    const verified = await ridersService.verify(rider._id.toString());
    expect(verified.isVerified).toBe(true);

    const all = await ridersService.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].isVerified).toBe(true);
  });

  it('assertVerified throws ForbiddenException until an admin verifies the rider', async () => {
    const customer = await createCustomer();
    await ridersService.apply(requesterFor(customer), {
      vehicleType: 'motorcycle',
    });

    await expect(
      ridersService.assertVerified(customer._id.toString()),
    ).rejects.toThrow(ForbiddenException);

    const rider = await ridersService.findMine(customer._id.toString());
    await ridersService.verify(rider._id.toString());

    await expect(
      ridersService.assertVerified(customer._id.toString()),
    ).resolves.toBeDefined();
  });
});
