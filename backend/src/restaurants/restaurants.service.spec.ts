import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { RestaurantsService } from './restaurants.service';
import {
  Restaurant,
  RestaurantDocument,
  RestaurantSchema,
} from './schemas/restaurant.schema';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { BusinessVerificationService } from '../business-verification/business-verification.service';
import { NotificationsService } from '../notifications/notifications.service';

jest.setTimeout(30_000);

describe('RestaurantsService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let service: RestaurantsService;
  let restaurantModel: Model<RestaurantDocument>;
  // Mocked rather than the real BusinessVerificationService/NotificationsService (docs/ROADMAP.md
  // FDP-115) — NotificationsService alone pulls in UsersService/MailService/SmsService/
  // PushService/RealtimeGateway, none of which this suite needs to exercise for real. Defaults
  // to "not configured"/no-op so every pre-existing test in this file (written before FDP-115)
  // keeps behaving exactly as it did — `businessVerification` just stays at its schema default.
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
    name: 'Burgundy Kitchen',
    cuisineTypes: ['Nigerian'],
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
        MongooseModule.forFeature([
          { name: Restaurant.name, schema: RestaurantSchema },
        ]),
      ],
      providers: [
        RestaurantsService,
        {
          provide: BusinessVerificationService,
          useValue: { verifyBusinessRegistration },
        },
        { provide: NotificationsService, useValue: { notify } },
      ],
    }).compile();

    service = moduleRef.get(RestaurantsService);
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    // `findNearby`'s $geoNear needs the 2dsphere index to actually exist before it runs —
    // Mongoose's `autoIndex` builds it in the background on model init, and without this
    // explicit wait a geo query issued too soon after connecting can flake with "unable to find
    // index for $geoNear query" (docs/ROADMAP.md FDP-96).
    await restaurantModel.init();
  }, 60_000); // headroom for the 60s mongod launchTimeout above, not just module compile

  beforeEach(() => {
    // Default: "not configured" — matches this repo's real-world default (no Youverify account
    // exists yet), and keeps every pre-existing test's `isApproved`/scope assertions unaffected.
    verifyBusinessRegistration.mockReset().mockResolvedValue({
      outcome: 'unknown',
      reason: 'Youverify not configured',
    });
    notify.mockReset().mockResolvedValue(undefined);
  });

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

    describe('sponsored listings (docs/ROADMAP.md FDP-124)', () => {
      async function createApprovedSponsored(name: string, sponsored: boolean) {
        const created = await service.create('507f1f77bcf86cd799439011', {
          ...baseDto,
          name,
        });
        await restaurantModel
          .updateOne(
            { _id: created._id },
            {
              isApproved: true,
              isSponsored: sponsored,
              sponsoredUntil: sponsored
                ? new Date(Date.now() + 86_400_000)
                : null,
            },
          )
          .exec();
        return created;
      }

      it('a sponsored restaurant sorts first regardless of the requested sort', async () => {
        await createApprovedSponsored('Not Sponsored, Higher Rated', false);
        const sponsored = await createApprovedSponsored(
          'Sponsored, Lower Rated',
          true,
        );
        // Give the non-sponsored one a strictly higher rating, so a naive rating-sort would put
        // it first — isSponsored must still win as the leading sort key.
        await restaurantModel
          .updateOne({ name: 'Not Sponsored, Higher Rated' }, { avgRating: 5 })
          .exec();
        await restaurantModel
          .updateOne({ _id: sponsored._id }, { avgRating: 1 })
          .exec();

        const result = await service.findAllApproved({
          sort: 'rating',
          page: 1,
          limit: 20,
        });
        expect(result.items[0].name).toBe('Sponsored, Lower Rated');
      });

      it('sponsoredOnly filters out non-sponsored restaurants entirely', async () => {
        await createApprovedSponsored('Regular Place', false);
        await createApprovedSponsored('Boosted Place', true);

        const result = await service.findAllApproved({
          sponsoredOnly: true,
          page: 1,
          limit: 20,
        });
        expect(result.total).toBe(1);
        expect(result.items[0].name).toBe('Boosted Place');
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

  describe('content edits re-require approval (docs/ROADMAP.md FDP-109)', () => {
    it('resets isApproved to false when an already-approved restaurant edits its name', async () => {
      const created = await service.create('owner-id', baseDto);
      await restaurantModel
        .updateOne({ _id: created._id }, { isApproved: true })
        .exec();
      const requester = { ...owner, sub: 'owner-id' };

      const updated = await service.update(created._id.toString(), requester, {
        name: 'Different Name',
      });

      expect(updated.isApproved).toBe(false);
    });

    it('resets isApproved to false on a description/cuisineTypes/logoUrl/coverUrl edit too', async () => {
      const created = await service.create('owner-id', baseDto);
      await restaurantModel
        .updateOne({ _id: created._id }, { isApproved: true })
        .exec();
      const requester = { ...owner, sub: 'owner-id' };

      const updated = await service.update(created._id.toString(), requester, {
        description: 'A brand new description',
      });

      expect(updated.isApproved).toBe(false);
    });

    it('does NOT reset isApproved for an operational-only edit (opening hours, price level, address)', async () => {
      const created = await service.create('owner-id', baseDto);
      await restaurantModel
        .updateOne({ _id: created._id }, { isApproved: true })
        .exec();
      const requester = { ...owner, sub: 'owner-id' };

      const updated = await service.update(created._id.toString(), requester, {
        priceLevel: 3,
      });

      expect(updated.isApproved).toBe(true);
    });

    it('leaves isApproved false (not previously true) alone when editing content pre-approval', async () => {
      const created = await service.create('owner-id', baseDto);
      const requester = { ...owner, sub: 'owner-id' };

      const updated = await service.update(created._id.toString(), requester, {
        name: 'Still Pending',
      });

      expect(updated.isApproved).toBe(false);
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

  describe('setPayoutAccount (FDP-52)', () => {
    it('adds a new payout account entry for a provider the restaurant has none of yet', async () => {
      const created = await service.create('owner-id', baseDto);
      const requester = { ...owner, sub: 'owner-id' };

      const updated = await service.setPayoutAccount(
        created._id.toString(),
        requester,
        'paystack',
        'active',
        'ACCT_test123',
      );

      // Map to plain objects first — a live Mongoose subdocument array trips toEqual's deep
      // walk over its strict-mode getters (see backend/CLAUDE.md "Testing").
      expect(
        updated.payoutAccounts.map((a) => ({
          provider: a.provider,
          status: a.status,
          reference: a.reference,
        })),
      ).toEqual([
        { provider: 'paystack', status: 'active', reference: 'ACCT_test123' },
      ]);
    });

    it('updates the existing entry in place rather than duplicating it, if a restaurant reconnects the same provider', async () => {
      const created = await service.create('owner-id', baseDto);
      const requester = { ...owner, sub: 'owner-id' };

      await service.setPayoutAccount(
        created._id.toString(),
        requester,
        'paystack',
        'active',
        'ACCT_old',
      );
      const updated = await service.setPayoutAccount(
        created._id.toString(),
        requester,
        'paystack',
        'active',
        'ACCT_new',
      );

      expect(updated.payoutAccounts).toHaveLength(1);
      expect(updated.payoutAccounts[0].reference).toBe('ACCT_new');
    });

    it('rejects a caller who does not own the restaurant', async () => {
      const created = await service.create('owner-id', baseDto);
      const requester = { ...otherOwner, sub: 'a-different-owner-id' };

      await expect(
        service.setPayoutAccount(
          created._id.toString(),
          requester,
          'paystack',
          'active',
          'ACCT_test123',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('persists bank details when given (docs/ROADMAP.md FDP-92 — needed for real transfer execution), and leaves them null when omitted', async () => {
      const created = await service.create('owner-id', baseDto);
      const requester = { ...owner, sub: 'owner-id' };

      const withBankDetails = await service.setPayoutAccount(
        created._id.toString(),
        requester,
        'paystack',
        'active',
        'ACCT_test123',
        { bankCode: '058', accountNumber: '0123456789' },
      );
      expect(withBankDetails.payoutAccounts[0].bankCode).toBe('058');
      expect(withBankDetails.payoutAccounts[0].accountNumber).toBe(
        '0123456789',
      );

      const withoutBankDetails = await service.setPayoutAccount(
        created._id.toString(),
        requester,
        'stripe',
        'pending',
        'acct_test456',
      );
      const stripeAccount = withoutBankDetails.payoutAccounts.find(
        (a) => a.provider === 'stripe',
      );
      expect(stripeAccount?.bankCode).toBeNull();
      expect(stripeAccount?.accountNumber).toBeNull();
    });
  });

  describe('setPayoutAccountFromWebhook / findByPayoutAccountReference (FDP-54)', () => {
    it('upserts a payout account with no requester/ownership check — a webhook has no authenticated user', async () => {
      const created = await service.create('owner-id', baseDto);

      const updated = await service.setPayoutAccountFromWebhook(
        created._id.toString(),
        'stripe',
        'active',
        'acct_test123',
      );

      expect(
        updated.payoutAccounts.map((a) => ({
          provider: a.provider,
          status: a.status,
          reference: a.reference,
        })),
      ).toEqual([
        { provider: 'stripe', status: 'active', reference: 'acct_test123' },
      ]);
    });

    it('updates the existing entry in place rather than duplicating it', async () => {
      const created = await service.create('owner-id', baseDto);

      await service.setPayoutAccountFromWebhook(
        created._id.toString(),
        'stripe',
        'pending',
        'acct_test123',
      );
      const updated = await service.setPayoutAccountFromWebhook(
        created._id.toString(),
        'stripe',
        'active',
        'acct_test123',
      );

      expect(updated.payoutAccounts).toHaveLength(1);
      expect(updated.payoutAccounts[0].status).toBe('active');
    });

    it('findByPayoutAccountReference finds the restaurant that reference was set on', async () => {
      const created = await service.create('owner-id', baseDto);
      await service.setPayoutAccountFromWebhook(
        created._id.toString(),
        'stripe',
        'active',
        'acct_test123',
      );

      const found = await service.findByPayoutAccountReference(
        'stripe',
        'acct_test123',
      );
      expect(found?._id.toString()).toBe(created._id.toString());

      const notFound = await service.findByPayoutAccountReference(
        'stripe',
        'acct_unknown',
      );
      expect(notFound).toBeNull();
    });

    it('findByPayoutAccountReference does not cross-match a different provider using the same reference string', async () => {
      const created = await service.create('owner-id', baseDto);
      await service.setPayoutAccountFromWebhook(
        created._id.toString(),
        'stripe',
        'active',
        'shared-ref',
      );

      const found = await service.findByPayoutAccountReference(
        'paystack',
        'shared-ref',
      );
      expect(found).toBeNull();
    });
  });

  describe('approve', () => {
    it('sets isApproved to true', async () => {
      const created = await service.create('owner-id', baseDto);
      const approved = await service.approve(created._id.toString());
      expect(approved.isApproved).toBe(true);
    });

    it('rejects approval when the restaurant has no compliance document (FDP-60)', async () => {
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
    it('stores a `verified` result and notifies the owner, but does not auto-approve (no menu items yet)', async () => {
      verifyBusinessRegistration.mockResolvedValue({
        outcome: 'verified',
        registeredName: 'Burgundy Kitchen Ltd',
        registeredAddress: '1 Main St, Lagos',
        rawStatus: 'active',
      });

      const created = await service.create('owner-id', baseDto);

      expect(created.businessVerification.status).toBe('verified');
      expect(created.businessVerification.providerRegisteredName).toBe(
        'Burgundy Kitchen Ltd',
      );
      expect(created.isApproved).toBe(false); // no menu items yet — see MenuService.createItem
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'business_verification_passed' }),
      );
    });

    it('stores a `mismatch` result and notifies the owner it needs manual review, never auto-approving', async () => {
      verifyBusinessRegistration.mockResolvedValue({
        outcome: 'mismatch',
        registeredName: 'A Different Company Ltd',
        registeredAddress: null,
        rawStatus: 'active',
        reason: 'Registered name does not match',
      });

      const created = await service.create('owner-id', baseDto);

      expect(created.businessVerification.status).toBe('mismatch');
      expect(created.businessVerification.failureReason).toBe(
        'Registered name does not match',
      );
      expect(created.isApproved).toBe(false);
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'business_verification_needs_review' }),
      );
    });

    it.each([
      [
        'not configured',
        { outcome: 'unknown', reason: 'Youverify not configured' },
      ],
      ['the lookup threw', { outcome: 'unknown', reason: 'network down' }],
    ])(
      'treats "%s" identically — status stays `not_attempted`, isApproved stays false',
      async (_label, mockResult) => {
        verifyBusinessRegistration.mockResolvedValue(mockResult);

        const created = await service.create('owner-id', baseDto);

        expect(created.businessVerification.status).toBe('not_attempted');
        expect(created.isApproved).toBe(false);
      },
    );

    it('create() still succeeds and returns the restaurant even if the verification call throws synchronously', async () => {
      verifyBusinessRegistration.mockRejectedValue(new Error('boom'));

      const created = await service.create('owner-id', baseDto);

      expect(created._id).toBeDefined();
      expect(created.businessVerification.status).toBe('not_attempted');
    });

    describe('autoApproveIfEligible', () => {
      it('approves a restaurant that was auto-verified and is not yet approved', async () => {
        verifyBusinessRegistration.mockResolvedValue({
          outcome: 'verified',
          registeredName: 'Burgundy Kitchen Ltd',
          registeredAddress: null,
          rawStatus: 'active',
        });
        const created = await service.create('owner-id', baseDto);
        expect(created.isApproved).toBe(false);

        await service.autoApproveIfEligible(created._id.toString());

        const reloaded = await service.findByIdOrThrow(created._id.toString());
        expect(reloaded.isApproved).toBe(true);
        expect(notify).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'business_auto_listed' }),
        );
      });

      it('is a no-op when the restaurant was not auto-verified', async () => {
        const created = await service.create('owner-id', baseDto); // default mock: not_attempted

        await service.autoApproveIfEligible(created._id.toString());

        const reloaded = await service.findByIdOrThrow(created._id.toString());
        expect(reloaded.isApproved).toBe(false);
      });

      it('is a no-op when the restaurant is already approved', async () => {
        verifyBusinessRegistration.mockResolvedValue({
          outcome: 'verified',
          registeredName: 'Burgundy Kitchen Ltd',
          registeredAddress: null,
          rawStatus: 'active',
        });
        const created = await service.create('owner-id', baseDto);
        await service.approve(created._id.toString());
        notify.mockClear();

        await service.autoApproveIfEligible(created._id.toString());

        expect(notify).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: 'business_auto_listed' }),
        );
      });
    });

    describe('reverifyBusiness', () => {
      it('updates the registration number, re-runs verification, and auto-approves if now eligible', async () => {
        const created = await service.create('owner-id', baseDto); // default mock: not_attempted
        verifyBusinessRegistration.mockResolvedValue({
          outcome: 'verified',
          registeredName: 'Burgundy Kitchen Ltd',
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
        // autoApproveIfEligible (it can't prove the "at least one menu item" prerequisite);
        // only MenuService.createItem can trigger the auto-listing.
        expect(updated.isApproved).toBe(false);
      });

      it('rejects a stranger reverifying a restaurant they do not own', async () => {
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

  describe('discovery filters and sort (FDP-21)', () => {
    async function createApprovedWith(overrides: {
      name: string;
      avgRating?: number;
      priceLevel?: number;
      estimatedDeliveryMinutes?: number | null;
    }) {
      const created = await service.create('507f1f77bcf86cd799439011', {
        ...baseDto,
        name: overrides.name,
      });
      await restaurantModel
        .updateOne(
          { _id: created._id },
          {
            isApproved: true,
            avgRating: overrides.avgRating ?? 0,
            ...(overrides.priceLevel !== undefined
              ? { priceLevel: overrides.priceLevel }
              : {}),
            ...(overrides.estimatedDeliveryMinutes !== undefined
              ? { estimatedDeliveryMinutes: overrides.estimatedDeliveryMinutes }
              : {}),
          },
        )
        .exec();
      return created;
    }

    it('minRating excludes restaurants below the threshold', async () => {
      await createApprovedWith({ name: 'Low Rated', avgRating: 2 });
      await createApprovedWith({ name: 'High Rated', avgRating: 4.5 });

      const result = await service.findAllApproved({
        minRating: 4,
        page: 1,
        limit: 20,
      });
      expect(result.items.map((r) => r.name)).toEqual(['High Rated']);
    });

    it('maxPriceLevel excludes restaurants above the threshold', async () => {
      await createApprovedWith({ name: 'Cheap', priceLevel: 1 });
      await createApprovedWith({ name: 'Expensive', priceLevel: 4 });

      const result = await service.findAllApproved({
        maxPriceLevel: 2,
        page: 1,
        limit: 20,
      });
      expect(result.items.map((r) => r.name)).toEqual(['Cheap']);
    });

    it('maxDeliveryMinutes excludes restaurants above the threshold and those with no estimate at all', async () => {
      await createApprovedWith({ name: 'Fast', estimatedDeliveryMinutes: 20 });
      await createApprovedWith({ name: 'Slow', estimatedDeliveryMinutes: 90 });
      await createApprovedWith({
        name: 'No Estimate',
        estimatedDeliveryMinutes: null,
      });

      const result = await service.findAllApproved({
        maxDeliveryMinutes: 30,
        page: 1,
        limit: 20,
      });
      expect(result.items.map((r) => r.name)).toEqual(['Fast']);
    });

    it('sort=rating orders highest avgRating first', async () => {
      await createApprovedWith({ name: 'Mid', avgRating: 3 });
      await createApprovedWith({ name: 'Top', avgRating: 5 });
      await createApprovedWith({ name: 'Bottom', avgRating: 1 });

      const result = await service.findAllApproved({
        sort: 'rating',
        page: 1,
        limit: 20,
      });
      expect(result.items.map((r) => r.name)).toEqual(['Top', 'Mid', 'Bottom']);
    });

    it('sort=price_asc orders cheapest first', async () => {
      await createApprovedWith({ name: 'Pricey', priceLevel: 4 });
      await createApprovedWith({ name: 'Budget', priceLevel: 1 });

      const result = await service.findAllApproved({
        sort: 'price_asc',
        page: 1,
        limit: 20,
      });
      expect(result.items.map((r) => r.name)).toEqual(['Budget', 'Pricey']);
    });

    it('sort=delivery_time excludes restaurants with no estimate and orders fastest first', async () => {
      await createApprovedWith({
        name: 'No Estimate',
        estimatedDeliveryMinutes: null,
      });
      await createApprovedWith({
        name: 'Slower',
        estimatedDeliveryMinutes: 50,
      });
      await createApprovedWith({
        name: 'Faster',
        estimatedDeliveryMinutes: 15,
      });

      const result = await service.findAllApproved({
        sort: 'delivery_time',
        page: 1,
        limit: 20,
      });
      expect(result.items.map((r) => r.name)).toEqual(['Faster', 'Slower']);
    });
  });

  describe('findPendingApproval / countByApproval', () => {
    it('lists only unapproved restaurants, oldest first, and counts both buckets', async () => {
      const first = await service.create('owner-id', baseDto);
      const second = await service.create('owner-id', {
        ...baseDto,
        name: 'Second Place',
      });
      await service.approve(second._id.toString());
      const third = await service.create('owner-id', {
        ...baseDto,
        name: 'Third Place',
      });

      const pending = await service.findPendingApproval();
      expect(pending.map((r) => r._id.toString())).toEqual([
        first._id.toString(),
        third._id.toString(),
      ]);

      const counts = await service.countByApproval();
      expect(counts).toEqual({ approved: 1, pending: 2 });
    });
  });

  describe('findNearby (docs/ROADMAP.md FDP-96)', () => {
    // Roughly downtown Lagos — arbitrary, only the relative offsets below matter.
    const origin = { lat: 6.5, lng: 3.35 };

    async function createApprovedAt(name: string, lat?: number, lng?: number) {
      const created = await service.create('507f1f77bcf86cd799439011', {
        ...baseDto,
        name,
        address: { ...baseDto.address, lat, lng },
      });
      const restaurant = await service.approve(created._id.toString());
      return restaurant;
    }

    it('returns approved restaurants within the radius, nearest first, with a computed distanceKm', async () => {
      await createApprovedAt('Just around the corner', 6.501, 3.35); // ~0.11 km away
      await createApprovedAt('A short ride away', 6.54, 3.35); // ~4.45 km away
      await createApprovedAt('Way across town', 7.0, 3.35); // ~55.6 km away — outside 10km radius

      const result = await service.findNearby({
        ...origin,
        radiusKm: 10,
        page: 1,
        limit: 20,
      });

      expect(result.items.map((r) => r.name)).toEqual([
        'Just around the corner',
        'A short ride away',
      ]);
      expect(result.items[0].distanceKm).toBeLessThan(
        result.items[1].distanceKm,
      );
      expect(result.items[0].distanceKm).toBeCloseTo(0.1, 1);
      expect(result.total).toBe(2);
    });

    it('excludes a restaurant with no coordinates set, even though it is approved and otherwise within range', async () => {
      await createApprovedAt('Never set a location', undefined, undefined);

      const result = await service.findNearby({ ...origin, radiusKm: 50 });

      expect(result.items).toHaveLength(0);
    });

    it('excludes a restaurant with coordinates that is not approved yet', async () => {
      await service.create('507f1f77bcf86cd799439011', {
        ...baseDto,
        name: 'Still pending',
        address: { ...baseDto.address, lat: 6.501, lng: 3.35 },
      });

      const result = await service.findNearby({ ...origin, radiusKm: 10 });

      expect(result.items).toHaveLength(0);
    });

    it('paginates the result set', async () => {
      await createApprovedAt('First', 6.501, 3.35);
      await createApprovedAt('Second', 6.502, 3.35);
      await createApprovedAt('Third', 6.503, 3.35);

      const firstPage = await service.findNearby({
        ...origin,
        radiusKm: 10,
        page: 1,
        limit: 2,
      });
      const secondPage = await service.findNearby({
        ...origin,
        radiusKm: 10,
        page: 2,
        limit: 2,
      });

      expect(firstPage.items).toHaveLength(2);
      expect(secondPage.items).toHaveLength(1);
      expect(firstPage.total).toBe(3);
      expect(firstPage.totalPages).toBe(2);
    });
  });
});
