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
import { BusinessVerificationService } from '../business-verification/business-verification.service';
import { NotificationsService } from '../notifications/notifications.service';

jest.setTimeout(30_000);

describe('StoresService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let service: StoresService;
  let storeModel: Model<StoreDocument>;
  // Mocked, not real — see RestaurantsService's equivalent spec for the full reasoning
  // (docs/ROADMAP.md FDP-115).
  let verifyBusinessRegistration: jest.Mock;
  let notify: jest.Mock;

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
    businessRegistrationNumber: 'RC1234567',
  };

  beforeAll(async () => {
    // See backend/CLAUDE.md ("Testing") for why launchTimeout is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    verifyBusinessRegistration = jest.fn();
    notify = jest.fn().mockResolvedValue(undefined);

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Store.name, schema: StoreSchema }]),
      ],
      providers: [
        StoresService,
        {
          provide: BusinessVerificationService,
          useValue: { verifyBusinessRegistration },
        },
        { provide: NotificationsService, useValue: { notify } },
      ],
    }).compile();

    service = moduleRef.get(StoresService);
    storeModel = moduleRef.get(getModelToken(Store.name));
    // See RestaurantsService's equivalent spec for why this explicit wait matters for
    // `findNearby`'s $geoNear (docs/ROADMAP.md FDP-96).
    await storeModel.init();
  }, 60_000);

  beforeEach(() => {
    verifyBusinessRegistration.mockReset().mockResolvedValue({
      outcome: 'unknown',
      reason: 'Youverify not configured',
    });
    notify.mockReset().mockResolvedValue(undefined);
  });

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

    describe('sponsored listings (docs/ROADMAP.md FDP-124)', () => {
      async function createApprovedSponsored(name: string, sponsored: boolean) {
        const created = await createApproved({ name, type: 'groceries' });
        await storeModel
          .updateOne(
            { _id: created._id },
            {
              isSponsored: sponsored,
              sponsoredUntil: sponsored
                ? new Date(Date.now() + 86_400_000)
                : null,
            },
          )
          .exec();
        return created;
      }

      it('a sponsored store sorts first regardless of the requested sort', async () => {
        await createApprovedSponsored('Not Sponsored, Higher Rated', false);
        const sponsored = await createApprovedSponsored(
          'Sponsored, Lower Rated',
          true,
        );
        await storeModel
          .updateOne({ name: 'Not Sponsored, Higher Rated' }, { avgRating: 5 })
          .exec();
        await storeModel
          .updateOne({ _id: sponsored._id }, { avgRating: 1 })
          .exec();

        const result = await service.findAllApproved({
          type: 'groceries',
          sort: 'rating',
          page: 1,
          limit: 20,
        });
        expect(result.items[0].name).toBe('Sponsored, Lower Rated');
      });

      it('sponsoredOnly filters out non-sponsored stores entirely', async () => {
        await createApprovedSponsored('Regular Store', false);
        await createApprovedSponsored('Boosted Store', true);

        const result = await service.findAllApproved({
          type: 'groceries',
          sponsoredOnly: true,
          page: 1,
          limit: 20,
        });
        expect(result.total).toBe(1);
        expect(result.items[0].name).toBe('Boosted Store');
      });
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

  describe('automated business verification (docs/ROADMAP.md FDP-115)', () => {
    it('stores a `verified` result and notifies the owner, but does not auto-approve (no products yet)', async () => {
      verifyBusinessRegistration.mockResolvedValue({
        outcome: 'verified',
        registeredName: 'Market Square Supermarket Ltd',
        registeredAddress: '1 Main St, Lagos',
        rawStatus: 'active',
      });

      const created = await service.create('owner-id', baseDto);

      expect(created.businessVerification.status).toBe('verified');
      expect(created.isApproved).toBe(false); // no products yet — see ProductsService.createProduct
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'business_verification_passed' }),
      );
    });

    it('stores a `mismatch` result and notifies the owner it needs manual review', async () => {
      verifyBusinessRegistration.mockResolvedValue({
        outcome: 'mismatch',
        registeredName: 'A Different Company Ltd',
        registeredAddress: null,
        rawStatus: 'active',
        reason: 'Registered name does not match',
      });

      const created = await service.create('owner-id', baseDto);

      expect(created.businessVerification.status).toBe('mismatch');
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'business_verification_needs_review' }),
      );
    });

    it('treats "not configured" and "the lookup threw" identically — status stays `not_attempted`', async () => {
      verifyBusinessRegistration.mockResolvedValue({
        outcome: 'unknown',
        reason: 'network down',
      });

      const created = await service.create('owner-id', baseDto);

      expect(created.businessVerification.status).toBe('not_attempted');
      expect(created.isApproved).toBe(false);
    });

    describe('autoApproveIfEligible', () => {
      it('approves a store that was auto-verified and is not yet approved', async () => {
        verifyBusinessRegistration.mockResolvedValue({
          outcome: 'verified',
          registeredName: 'Market Square Supermarket Ltd',
          registeredAddress: null,
          rawStatus: 'active',
        });
        const created = await service.create('owner-id', baseDto);

        await service.autoApproveIfEligible(created._id.toString());

        const reloaded = await service.findByIdOrThrow(created._id.toString());
        expect(reloaded.isApproved).toBe(true);
        expect(notify).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'business_auto_listed' }),
        );
      });

      it('is a no-op when the store was not auto-verified', async () => {
        const created = await service.create('owner-id', baseDto);

        await service.autoApproveIfEligible(created._id.toString());

        const reloaded = await service.findByIdOrThrow(created._id.toString());
        expect(reloaded.isApproved).toBe(false);
      });
    });

    describe('reverifyBusiness', () => {
      it('updates the registration number and re-runs verification, without auto-approving', async () => {
        const created = await service.create('owner-id', baseDto);
        verifyBusinessRegistration.mockResolvedValue({
          outcome: 'verified',
          registeredName: 'Market Square Supermarket Ltd',
          registeredAddress: null,
          rawStatus: 'active',
        });

        const updated = await service.reverifyBusiness(
          created._id.toString(),
          admin,
          'RC7654321',
        );

        expect(updated.businessRegistrationNumber).toBe('RC7654321');
        expect(updated.businessVerification.status).toBe('verified');
        // Still not approved — reverifyBusiness deliberately never calls
        // autoApproveIfEligible; only ProductsService.createProduct can trigger auto-listing.
        expect(updated.isApproved).toBe(false);
      });

      it('rejects a stranger reverifying a store they do not own', async () => {
        const created = await service.create('owner-id', baseDto);

        await expect(
          service.reverifyBusiness(
            created._id.toString(),
            otherOwner,
            'RC7654321',
          ),
        ).rejects.toThrow(ForbiddenException);
      });
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

    it('resets isApproved to false when an already-approved store edits its name (docs/ROADMAP.md FDP-109)', async () => {
      owner.sub = '507f1f77bcf86cd799439011';
      const created = await service.create(owner.sub, baseDto);
      await storeModel
        .updateOne({ _id: created._id }, { isApproved: true })
        .exec();

      const updated = await service.update(created._id.toString(), owner, {
        name: 'Different Name',
      });

      expect(updated.isApproved).toBe(false);
    });

    it('does NOT reset isApproved for an operational-only edit like address', async () => {
      owner.sub = '507f1f77bcf86cd799439011';
      const created = await service.create(owner.sub, baseDto);
      await storeModel
        .updateOne({ _id: created._id }, { isApproved: true })
        .exec();

      const updated = await service.update(created._id.toString(), owner, {
        address: {
          line1: '2 New St',
          city: 'Lagos',
          state: 'Lagos',
          lat: 6.5,
          lng: 3.4,
        },
      });

      expect(updated.isApproved).toBe(true);
    });

    it('toggles isOpen', async () => {
      owner.sub = '507f1f77bcf86cd799439011';
      const created = await service.create(owner.sub, baseDto);
      expect(created.isOpen).toBe(true);

      const toggled = await service.toggleOpen(created._id.toString(), owner);
      expect(toggled.isOpen).toBe(false);
    });
  });

  describe('setPayoutAccount (docs/ROADMAP.md FDP-94)', () => {
    it('adds a new payout account entry, including bank details, for a provider the store has none of yet', async () => {
      owner.sub = '507f1f77bcf86cd799439011';
      const created = await service.create(owner.sub, baseDto);

      const updated = await service.setPayoutAccount(
        created._id.toString(),
        owner,
        'paystack',
        'active',
        'ACCT_test123',
        { bankCode: '058', accountNumber: '0123456789' },
      );

      expect(
        updated.payoutAccounts.map((a) => ({
          provider: a.provider,
          status: a.status,
          reference: a.reference,
          bankCode: a.bankCode,
          accountNumber: a.accountNumber,
        })),
      ).toEqual([
        {
          provider: 'paystack',
          status: 'active',
          reference: 'ACCT_test123',
          bankCode: '058',
          accountNumber: '0123456789',
        },
      ]);
    });

    it('updates the existing entry in place rather than duplicating it', async () => {
      owner.sub = '507f1f77bcf86cd799439011';
      const created = await service.create(owner.sub, baseDto);

      await service.setPayoutAccount(
        created._id.toString(),
        owner,
        'paystack',
        'active',
        'ACCT_old',
      );
      const updated = await service.setPayoutAccount(
        created._id.toString(),
        owner,
        'paystack',
        'active',
        'ACCT_new',
      );

      expect(updated.payoutAccounts).toHaveLength(1);
      expect(updated.payoutAccounts[0].reference).toBe('ACCT_new');
    });

    it('rejects a caller who does not own the store', async () => {
      owner.sub = '507f1f77bcf86cd799439011';
      otherOwner.sub = '507f1f77bcf86cd799439012';
      const created = await service.create(owner.sub, baseDto);

      await expect(
        service.setPayoutAccount(
          created._id.toString(),
          otherOwner,
          'paystack',
          'active',
          'ACCT_test123',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('setPayoutAccountFromWebhook upserts with no ownership check, and findByPayoutAccountReference finds it back', async () => {
      owner.sub = '507f1f77bcf86cd799439011';
      const created = await service.create(owner.sub, baseDto);

      await service.setPayoutAccountFromWebhook(
        created._id.toString(),
        'stripe',
        'pending',
        'acct_test456',
      );

      const found = await service.findByPayoutAccountReference(
        'stripe',
        'acct_test456',
      );
      expect(found?._id.toString()).toBe(created._id.toString());
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

  describe('findNearby (docs/ROADMAP.md FDP-96)', () => {
    const origin = { lat: 6.5, lng: 3.35 };

    async function createApprovedAt(
      name: string,
      type: 'groceries' | 'pharmacy_beauty',
      lat?: number,
      lng?: number,
    ) {
      const created = await service.create('507f1f77bcf86cd799439011', {
        ...baseDto,
        name,
        type,
        address: { ...baseDto.address, lat, lng },
      });
      return service.approve(created._id.toString());
    }

    it('returns approved stores of the requested type within the radius, nearest first', async () => {
      await createApprovedAt('Nearby Groceries', 'groceries', 6.501, 3.35);
      await createApprovedAt('Far Groceries', 'groceries', 7.0, 3.35); // ~55.6 km — outside 10km
      await createApprovedAt('Nearby Pharmacy', 'pharmacy_beauty', 6.502, 3.35);

      const result = await service.findNearby({
        ...origin,
        type: 'groceries',
        radiusKm: 10,
        page: 1,
        limit: 20,
      });

      expect(result.items.map((s) => s.name)).toEqual(['Nearby Groceries']);
      expect(result.items[0].distanceKm).toBeCloseTo(0.1, 1);
    });

    it('excludes a store with no coordinates set', async () => {
      await createApprovedAt('No location', 'groceries', undefined, undefined);

      const result = await service.findNearby({
        ...origin,
        type: 'groceries',
        radiusKm: 50,
      });

      expect(result.items).toHaveLength(0);
    });
  });
});
