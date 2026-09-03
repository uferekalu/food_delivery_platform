import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { StoresService } from './stores.service';
import { Store, StoreDocument, StoreSchema } from './schemas/store.schema';
import type { StoreType } from './schemas/store.schema';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';

jest.setTimeout(30_000);

describe('StoresService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let service: StoresService;
  let storeModel: Model<StoreDocument>;

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
    name: 'Market Square Supermarket',
    type: 'groceries' as const,
    currency: 'NGN',
    country: 'Nigeria',
    address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
    complianceDocumentUrl: 'https://example.com/doc.pdf',
  };

  beforeAll(async () => {
    // See backend/CLAUDE.md ("Testing") for why launchTimeout is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Store.name, schema: StoreSchema }]),
      ],
      providers: [StoresService],
    }).compile();

    service = moduleRef.get(StoresService);
    storeModel = moduleRef.get(getModelToken(Store.name));
  }, 60_000);

  afterEach(async () => {
    await storeModel.deleteMany({}).exec();
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  async function createApproved(
    overrides: Partial<Omit<typeof baseDto, 'type'>> & {
      type?: StoreType;
    } = {},
  ) {
    const created = await service.create('owner-id', {
      ...baseDto,
      ...overrides,
    });
    await storeModel
      .updateOne({ _id: created._id }, { isApproved: true })
      .exec();
    return created;
  }

  describe('create', () => {
    it('generates a URL-safe slug from the name', async () => {
      const store = await service.create('507f1f77bcf86cd799439011', baseDto);
      expect(store.slug).toBe('market-square-supermarket');
      expect(store.isApproved).toBe(false); // pending admin approval by default
    });

    it('disambiguates a slug collision with a numeric suffix', async () => {
      await service.create('507f1f77bcf86cd799439011', baseDto);
      const second = await service.create('507f1f77bcf86cd799439012', baseDto);
      expect(second.slug).toBe('market-square-supermarket-1');
    });
  });

  describe('findAllApproved', () => {
    it('excludes stores that have not been approved', async () => {
      await service.create('507f1f77bcf86cd799439011', baseDto);
      const result = await service.findAllApproved({
        type: 'groceries',
        page: 1,
        limit: 20,
      });
      expect(result.items).toHaveLength(0);
    });

    it('includes approved stores of the requested type only', async () => {
      await createApproved({ name: 'Grocery One', type: 'groceries' });
      await createApproved({
        name: 'Pharmacy One',
        type: 'pharmacy_beauty',
      });

      const result = await service.findAllApproved({
        type: 'groceries',
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(1);
      expect(result.items[0].name).toBe('Grocery One');
    });

    it('filters by sub-category tag', async () => {
      await createApproved({
        name: 'Has Bakery Tag',
        tags: ['Bakery'],
      } as never);
      await createApproved({
        name: 'No Bakery Tag',
        tags: ['Supermarket'],
      } as never);

      const result = await service.findAllApproved({
        type: 'groceries',
        tag: 'Bakery',
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(1);
      expect(result.items[0].name).toBe('Has Bakery Tag');
    });

    it('matches a case-insensitive partial name search', async () => {
      await createApproved({ name: 'Market Square Supermarket' });

      const result = await service.findAllApproved({
        type: 'groceries',
        search: 'MARKET',
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(1);
    });
  });

  describe('findBySlug', () => {
    it('404s for a store that exists but has not been approved yet', async () => {
      await service.create('507f1f77bcf86cd799439011', baseDto);
      await expect(
        service.findBySlug('market-square-supermarket'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the store once approved', async () => {
      await createApproved();
      const found = await service.findBySlug('market-square-supermarket');
      expect(found.name).toBe('Market Square Supermarket');
    });
  });

  describe('approve', () => {
    it('sets isApproved to true', async () => {
      const created = await service.create('owner-id', baseDto);
      const approved = await service.approve(created._id.toString());
      expect(approved.isApproved).toBe(true);
    });

    it('rejects approval when the store has no compliance document', async () => {
      const created = await service.create('owner-id', {
        ...baseDto,
        complianceDocumentUrl: undefined as unknown as string,
      });

      await expect(service.approve(created._id.toString())).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update / toggleOpen / assertOwnerOrAdmin', () => {
    it('lets the owner update their own store', async () => {
      owner.sub = '507f1f77bcf86cd799439011';
      const created = await service.create(owner.sub, baseDto);

      const updated = await service.update(created._id.toString(), owner, {
        name: 'Renamed Store',
      });
      expect(updated.name).toBe('Renamed Store');
    });

    it('rejects an update from a non-owning restaurant_owner', async () => {
      owner.sub = '507f1f77bcf86cd799439011';
      otherOwner.sub = '507f1f77bcf86cd799439012';
      const created = await service.create(owner.sub, baseDto);

      await expect(
        service.update(created._id.toString(), otherOwner, {
          name: 'Hijacked',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets an admin update any store', async () => {
      owner.sub = '507f1f77bcf86cd799439011';
      const created = await service.create(owner.sub, baseDto);

      const updated = await service.update(created._id.toString(), admin, {
        name: 'Admin Renamed',
      });
      expect(updated.name).toBe('Admin Renamed');
    });

    it('toggles isOpen', async () => {
      owner.sub = '507f1f77bcf86cd799439011';
      const created = await service.create(owner.sub, baseDto);
      expect(created.isOpen).toBe(true);

      const toggled = await service.toggleOpen(created._id.toString(), owner);
      expect(toggled.isOpen).toBe(false);
    });
  });

  describe('findPendingApproval / countByApproval', () => {
    it('lists only unapproved stores, oldest first, and counts both buckets', async () => {
      const first = await service.create('owner-id', {
        ...baseDto,
        name: 'First',
      });
      const second = await service.create('owner-id', {
        ...baseDto,
        name: 'Second',
      });
      await service.approve(second._id.toString());
      const third = await service.create('owner-id', {
        ...baseDto,
        name: 'Third',
      });

      const pending = await service.findPendingApproval();
      expect(pending.map((s) => s._id.toString())).toEqual([
        first._id.toString(),
        third._id.toString(),
      ]);

      const counts = await service.countByApproval();
      expect(counts).toEqual({ approved: 1, pending: 2 });
    });
  });
});
