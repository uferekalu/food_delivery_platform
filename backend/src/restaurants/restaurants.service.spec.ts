import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { RestaurantsService } from './restaurants.service';
import {
  Restaurant,
  RestaurantDocument,
  RestaurantSchema,
} from './schemas/restaurant.schema';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';

jest.setTimeout(30_000);

describe('RestaurantsService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let service: RestaurantsService;
  let restaurantModel: Model<RestaurantDocument>;

  const owner: AccessTokenPayload = {
    sub: '',
    email: 'owner@example.com',
    role: 'restaurant_owner',
  };
  const otherOwner: AccessTokenPayload = {
    sub: '',
    email: 'other@example.com',
    role: 'restaurant_owner',
  };
  const admin: AccessTokenPayload = {
    sub: '',
    email: 'admin@example.com',
    role: 'admin',
  };

  const baseDto = {
    name: 'Burgundy Kitchen',
    cuisineTypes: ['Nigerian'],
    currency: 'NGN',
    country: 'Nigeria',
    address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
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
        ]),
      ],
      providers: [RestaurantsService],
    }).compile();

    service = moduleRef.get(RestaurantsService);
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
  }, 60_000); // headroom for the 60s mongod launchTimeout above, not just module compile

  afterEach(async () => {
    await restaurantModel.deleteMany({}).exec();
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  describe('create', () => {
    it('generates a URL-safe slug from the name', async () => {
      const restaurant = await service.create(
        '507f1f77bcf86cd799439011',
        baseDto,
      );
      expect(restaurant.slug).toBe('burgundy-kitchen');
      expect(restaurant.isApproved).toBe(false); // pending admin approval by default
    });

    it('disambiguates a slug collision with a numeric suffix', async () => {
      await service.create('507f1f77bcf86cd799439011', baseDto);
      const second = await service.create('507f1f77bcf86cd799439012', baseDto);
      expect(second.slug).toBe('burgundy-kitchen-1');
    });
  });

  describe('findAllApproved', () => {
    it('excludes restaurants that have not been approved', async () => {
      await service.create('507f1f77bcf86cd799439011', baseDto);
      const result = await service.findAllApproved({ page: 1, limit: 20 });
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('includes approved restaurants and paginates', async () => {
      const created = await service.create('507f1f77bcf86cd799439011', baseDto);
      await restaurantModel
        .updateOne({ _id: created._id }, { isApproved: true })
        .exec();

      const result = await service.findAllApproved({ page: 1, limit: 20 });
      expect(result.total).toBe(1);
      expect(result.items[0].slug).toBe('burgundy-kitchen');
    });

    describe('search', () => {
      async function createApproved(name: string, cuisineTypes: string[]) {
        const created = await service.create('507f1f77bcf86cd799439011', {
          ...baseDto,
          name,
          cuisineTypes,
        });
        await restaurantModel
          .updateOne({ _id: created._id }, { isApproved: true })
          .exec();
        return created;
      }

      it('matches a partial word inside the name, not just a whole word', async () => {
        // The exact bug reported live: typing "fd" against "FDP15 Test Kitchen" returned
        // nothing under the old MongoDB $text search, since $text only matches whole
        // tokens/stems, never a substring within one.
        await createApproved('FDP15 Test Kitchen', ['Test']);

        const result = await service.findAllApproved({
          search: 'fd',
          page: 1,
          limit: 20,
        });
        expect(result.total).toBe(1);
        expect(result.items[0].name).toBe('FDP15 Test Kitchen');
      });

      it('is case-insensitive', async () => {
        await createApproved('Burgundy Kitchen', ['Nigerian']);

        const result = await service.findAllApproved({
          search: 'BURGUNDY',
          page: 1,
          limit: 20,
        });
        expect(result.total).toBe(1);
      });

      it('also matches a substring of a cuisine type', async () => {
        await createApproved('Some Place', ['Nigerian', 'Grill']);

        const result = await service.findAllApproved({
          search: 'grill',
          page: 1,
          limit: 20,
        });
        expect(result.total).toBe(1);
      });

      it('returns nothing for a search that matches no restaurant', async () => {
        await createApproved('Burgundy Kitchen', ['Nigerian']);

        const result = await service.findAllApproved({
          search: 'sushi',
          page: 1,
          limit: 20,
        });
        expect(result.total).toBe(0);
      });

      it('treats regex metacharacters in the search term as literal text, not a pattern', async () => {
        await createApproved('Burgundy Kitchen', ['Nigerian']);

        const result = await service.findAllApproved({
          search: '.*',
          page: 1,
          limit: 20,
        });
        expect(result.total).toBe(0); // no restaurant literally named/tagged ".*"
      });
    });
  });

  describe('findBySlug', () => {
    it('404s for a restaurant that exists but has not been approved yet', async () => {
      await service.create('507f1f77bcf86cd799439011', baseDto);
      await expect(service.findBySlug('burgundy-kitchen')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the restaurant once approved', async () => {
      const created = await service.create('507f1f77bcf86cd799439011', baseDto);
      await restaurantModel
        .updateOne({ _id: created._id }, { isApproved: true })
        .exec();
      const found = await service.findBySlug('burgundy-kitchen');
      expect(found.name).toBe('Burgundy Kitchen');
    });
  });

  describe('ownership enforcement', () => {
    it('allows the owner to update their own restaurant', async () => {
      const created = await service.create('owner-id', baseDto);
      const requester = { ...owner, sub: 'owner-id' };
      const updated = await service.update(created._id.toString(), requester, {
        name: 'New Name',
      });
      expect(updated.name).toBe('New Name');
    });

    it('rejects a different restaurant_owner updating a restaurant they do not own', async () => {
      const created = await service.create('owner-id', baseDto);
      const requester = { ...otherOwner, sub: 'a-different-owner-id' };
      await expect(
        service.update(created._id.toString(), requester, { name: 'Hijacked' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows an admin to update any restaurant', async () => {
      const created = await service.create('owner-id', baseDto);
      const requester = { ...admin, sub: 'some-admin-id' };
      const updated = await service.update(created._id.toString(), requester, {
        name: 'Admin Edit',
      });
      expect(updated.name).toBe('Admin Edit');
    });

    it('throws NotFoundException for a nonexistent restaurant id', async () => {
      const requester = { ...admin, sub: 'some-admin-id' };
      await expect(
        service.update('507f1f77bcf86cd799439099', requester, { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleOpen', () => {
    it('flips isOpen each call', async () => {
      const created = await service.create('owner-id', baseDto);
      const requester = { ...owner, sub: 'owner-id' };
      expect(created.isOpen).toBe(true);

      const first = await service.toggleOpen(created._id.toString(), requester);
      expect(first.isOpen).toBe(false);

      const second = await service.toggleOpen(
        created._id.toString(),
        requester,
      );
      expect(second.isOpen).toBe(true);
    });
  });

  describe('approve', () => {
    it('sets isApproved to true', async () => {
      const created = await service.create('owner-id', baseDto);
      const approved = await service.approve(created._id.toString());
      expect(approved.isApproved).toBe(true);
    });
  });
});
