import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
import {
  RefreshToken,
  RefreshTokenSchema,
} from '../auth/schemas/refresh-token.schema';
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
          { name: RefreshToken.name, schema: RefreshTokenSchema },
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

  function kycFields() {
    return {
      dateOfBirth: '1995-06-15',
      governmentIdType: 'national_id' as const,
      governmentIdNumber: 'A1234567',
      governmentIdDocumentUrl: 'https://example.com/id.pdf',
      proofOfAddressDocumentUrl: 'https://example.com/address.pdf',
      driversLicenseNumber: 'DL-998877',
      driversLicenseExpiry: '2030-01-01',
      driversLicenseDocumentUrl: 'https://example.com/license.pdf',
      vehiclePlateNumber: 'ABC-123XY',
      vehicleRegistrationDocumentUrl: 'https://example.com/vehicle-reg.pdf',
      guarantor: {
        fullName: 'Jane Guarantor',
        phone: '+2348000000000',
        relationship: 'Sister',
        address: '12 Guarantor Street, Lagos',
      },
      nextOfKinName: 'John Nextofkin',
      nextOfKinPhone: '+2348011111111',
      nextOfKinRelationship: 'Brother',
    };
  }

  it('apply creates a Rider profile and promotes the user role', async () => {
    const customer = await createCustomer();
    const rider = await ridersService.apply(requesterFor(customer), {
      vehicleType: 'motorcycle',
      ...kycFields(),
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
      ...kycFields(),
    });

    await expect(
      ridersService.apply(
        { sub: customer._id.toString(), email: customer.email, role: 'rider' },
        { vehicleType: 'car', ...kycFields() },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('apply rejects an already-rider or admin requester without touching the database', async () => {
    const customer = await createCustomer();
    await expect(
      ridersService.apply(
        { sub: customer._id.toString(), email: customer.email, role: 'admin' },
        { vehicleType: 'car', ...kycFields() },
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
        { vehicleType: 'car', ...kycFields() },
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
      ...kycFields(),
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
      ...kycFields(),
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
      ...kycFields(),
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

  it('apply rejects an applicant under 18 (FDP-61)', async () => {
    const customer = await createCustomer();
    const today = new Date();
    const under18 = new Date(
      today.getFullYear() - 17,
      today.getMonth(),
      today.getDate(),
    );

    await expect(
      ridersService.apply(requesterFor(customer), {
        vehicleType: 'bicycle',
        ...kycFields(),
        dateOfBirth: under18.toISOString().slice(0, 10),
      }),
    ).rejects.toThrow(BadRequestException);

    const count = await riderModel.countDocuments().exec();
    expect(count).toBe(0);
  });

  it('verify rejects a rider missing required KYC information (FDP-61)', async () => {
    const customer = await createCustomer();
    // Bypasses both ApplyRiderDto and schema validation (validateBeforeSave: false) to
    // simulate legacy data from before these fields existed — RidersService.verify() must
    // still catch it, not just trust that every Rider document was created via apply().
    const incompleteRider = new riderModel({
      userId: customer._id,
      vehicleType: 'motorcycle',
    });
    await incompleteRider.save({ validateBeforeSave: false });

    await expect(
      ridersService.verify(incompleteRider._id.toString()),
    ).rejects.toThrow(BadRequestException);
  });

  describe('countByVerification', () => {
    it('counts verified and pending riders separately', async () => {
      const a = await createCustomer();
      const b = await createCustomer();
      const riderA = await ridersService.apply(requesterFor(a), {
        vehicleType: 'bicycle',
        ...kycFields(),
      });
      await ridersService.apply(requesterFor(b), {
        vehicleType: 'car',
        ...kycFields(),
      });
      await ridersService.verify(riderA._id.toString());

      expect(await ridersService.countByVerification()).toEqual({
        verified: 1,
        pending: 1,
      });
    });
  });
});
