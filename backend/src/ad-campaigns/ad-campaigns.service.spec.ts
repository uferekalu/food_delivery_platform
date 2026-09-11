import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { AdCampaignsService } from './ad-campaigns.service';
import {
  AdCampaign,
  AdCampaignDocument,
  AdCampaignSchema,
} from './schemas/ad-campaign.schema';
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
import { BusinessVerificationService } from '../business-verification/business-verification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentProviderResolver } from '../payments/provider-resolver';
import { StripeAdapter } from '../payments/adapters/stripe.adapter';
import { PaystackAdapter } from '../payments/adapters/paystack.adapter';
import { FlutterwaveAdapter } from '../payments/adapters/flutterwave.adapter';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';

jest.setTimeout(30_000);

describe('AdCampaignsService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let service: AdCampaignsService;
  let restaurantsService: RestaurantsService;
  let storesService: StoresService;
  let adCampaignModel: Model<AdCampaignDocument>;
  let restaurantModel: Model<RestaurantDocument>;
  let storeModel: Model<StoreDocument>;
  let stripeAdapter: {
    initiate: jest.Mock;
    verify: jest.Mock;
    handleWebhook: jest.Mock;
  };
  let paystackAdapterMock: {
    initiate: jest.Mock;
    verify: jest.Mock;
    handleWebhook: jest.Mock;
  };

  const admin: AccessTokenPayload = {
    sub: 'admin-id',
    email: 'admin@example.com',
    role: 'admin',
  };

  async function createOwnedRestaurant(ownerId: string, name = 'Test Kitchen') {
    const restaurant = await restaurantsService.create(ownerId, {
      name,
      cuisineTypes: ['Nigerian'],
      currency: 'NGN',
      country: 'Nigeria',
      address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
      complianceDocumentUrl: 'https://example.com/doc.pdf',
      businessRegistrationNumber: 'RC1234567',
    });
    return restaurantsService.approve(restaurant._id.toString());
  }

  async function createOwnedStore(ownerId: string, name = 'Test Mart') {
    const store = await storesService.create(ownerId, {
      name,
      type: 'groceries',
      currency: 'NGN',
      country: 'Nigeria',
      address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
      complianceDocumentUrl: 'https://example.com/doc.pdf',
      businessRegistrationNumber: 'RC1234567',
    });
    return storesService.approve(store._id.toString());
  }

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    stripeAdapter = {
      initiate: jest.fn().mockResolvedValue({
        redirectUrl: 'https://stripe.example/checkout',
        reference: 'stripe-ref-1',
      }),
      verify: jest
        .fn()
        .mockResolvedValue({ success: true, reference: 'stripe-ref-1' }),
      handleWebhook: jest.fn(),
    };
    paystackAdapterMock = {
      initiate: jest.fn(),
      verify: jest.fn(),
      handleWebhook: jest.fn(),
    };

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: AdCampaign.name, schema: AdCampaignSchema },
          { name: Restaurant.name, schema: RestaurantSchema },
          { name: Store.name, schema: StoreSchema },
        ]),
      ],
      providers: [
        AdCampaignsService,
        RestaurantsService,
        StoresService,
        PaymentProviderResolver,
        {
          provide: BusinessVerificationService,
          useValue: {
            verifyBusinessRegistration: jest.fn().mockResolvedValue({
              outcome: 'unknown',
              reason: 'not configured',
            }),
          },
        },
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('http://localhost:3000'),
          },
        },
        { provide: StripeAdapter, useValue: stripeAdapter },
        { provide: PaystackAdapter, useValue: paystackAdapterMock },
        {
          provide: FlutterwaveAdapter,
          useValue: {
            initiate: jest.fn(),
            verify: jest.fn(),
            handleWebhook: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AdCampaignsService);
    restaurantsService = moduleRef.get(RestaurantsService);
    storesService = moduleRef.get(StoresService);
    adCampaignModel = moduleRef.get(getModelToken(AdCampaign.name));
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    storeModel = moduleRef.get(getModelToken(Store.name));
  }, 60_000);

  afterEach(async () => {
    jest.clearAllMocks();
    stripeAdapter.initiate.mockResolvedValue({
      redirectUrl: 'https://stripe.example/checkout',
      reference: 'stripe-ref-1',
    });
    await Promise.all([
      adCampaignModel.deleteMany({}).exec(),
      restaurantModel.deleteMany({}).exec(),
      storeModel.deleteMany({}).exec(),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  describe('create', () => {
    it('rejects when neither restaurantId nor storeId is provided', async () => {
      await expect(
        service.create(
          { startDate: new Date().toISOString(), durationDays: 7 },
          admin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when both restaurantId and storeId are provided', async () => {
      const restaurant = await createOwnedRestaurant('owner-1');
      const store = await createOwnedStore('owner-1');
      await expect(
        service.create(
          {
            restaurantId: restaurant._id.toString(),
            storeId: store._id.toString(),
            startDate: new Date().toISOString(),
            durationDays: 7,
          },
          admin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('computes totalPrice from dailyRate * durationDays when no override is given', async () => {
      const restaurant = await createOwnedRestaurant('owner-2');
      const campaign = await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: new Date().toISOString(),
          durationDays: 7,
        },
        admin,
      );
      expect(campaign.dailyRate).toBe(5000); // NGN table rate
      expect(campaign.totalPrice).toBe(35000);
      expect(campaign.priceOverridden).toBe(false);
      expect(campaign.status).toBe('pending_payment');
    });

    it('respects a totalPriceOverride', async () => {
      const restaurant = await createOwnedRestaurant('owner-3');
      const campaign = await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: new Date().toISOString(),
          durationDays: 7,
          totalPriceOverride: 1234,
        },
        admin,
      );
      expect(campaign.totalPrice).toBe(1234);
      expect(campaign.priceOverridden).toBe(true);
    });

    it('rejects a second non-terminal campaign for a vendor that already has one', async () => {
      const restaurant = await createOwnedRestaurant('owner-4');
      await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: new Date().toISOString(),
          durationDays: 7,
        },
        admin,
      );
      await expect(
        service.create(
          {
            restaurantId: restaurant._id.toString(),
            startDate: new Date().toISOString(),
            durationDays: 7,
          },
          admin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows a new campaign once the previous one for that vendor is terminal (cancelled)', async () => {
      const restaurant = await createOwnedRestaurant('owner-5');
      const first = await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: new Date().toISOString(),
          durationDays: 7,
        },
        admin,
      );
      await service.cancel(first._id.toString(), 'testing');

      const second = await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: new Date().toISOString(),
          durationDays: 7,
        },
        admin,
      );
      expect(second.status).toBe('pending_payment');
    });
  });

  describe('payment success (webhook + verify)', () => {
    it('a future-dated campaign moves to scheduled, not active, on payment success', async () => {
      const restaurant = await createOwnedRestaurant('owner-6');
      const futureStart = new Date();
      futureStart.setDate(futureStart.getDate() + 10);
      const campaign = await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: futureStart.toISOString(),
          durationDays: 7,
        },
        admin,
      );
      await service.initiateCampaignPayment(
        campaign._id.toString(),
        {
          sub: 'owner-6',
          email: 'owner6@example.com',
          role: 'restaurant_owner',
        },
        'stripe',
      );

      stripeAdapter.handleWebhook.mockResolvedValue({
        reference: 'stripe-ref-1',
        success: true,
      });
      await service.handleWebhook('stripe', Buffer.alloc(0), 'sig');

      const updated = await service.findByIdOrThrow(campaign._id.toString());
      expect(updated.status).toBe('scheduled');
      expect(updated.paymentStatus).toBe('succeeded');

      const updatedRestaurant = await restaurantModel
        .findById(restaurant._id)
        .exec();
      expect(updatedRestaurant!.isSponsored).toBe(false); // not live yet
    });

    it('a same-day campaign activates immediately on payment success and sponsors the vendor', async () => {
      const restaurant = await createOwnedRestaurant('owner-7');
      const campaign = await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: new Date().toISOString(),
          durationDays: 7,
        },
        admin,
      );
      await service.initiateCampaignPayment(
        campaign._id.toString(),
        {
          sub: 'owner-7',
          email: 'owner7@example.com',
          role: 'restaurant_owner',
        },
        'stripe',
      );

      stripeAdapter.handleWebhook.mockResolvedValue({
        reference: 'stripe-ref-1',
        success: true,
      });
      await service.handleWebhook('stripe', Buffer.alloc(0), 'sig');

      const updated = await service.findByIdOrThrow(campaign._id.toString());
      expect(updated.status).toBe('active');

      const updatedRestaurant = await restaurantModel
        .findById(restaurant._id)
        .exec();
      expect(updatedRestaurant!.isSponsored).toBe(true);
      expect(updatedRestaurant!.sponsoredUntil).toEqual(updated.endDate);
    });

    it('a failed webhook leaves status untouched but flips paymentStatus to failed, and a retry can still succeed', async () => {
      const restaurant = await createOwnedRestaurant('owner-8');
      const campaign = await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: new Date().toISOString(),
          durationDays: 7,
        },
        admin,
      );
      const owner: AccessTokenPayload = {
        sub: 'owner-8',
        email: 'owner8@example.com',
        role: 'restaurant_owner',
      };
      await service.initiateCampaignPayment(
        campaign._id.toString(),
        owner,
        'stripe',
      );

      stripeAdapter.handleWebhook.mockResolvedValue({
        reference: 'stripe-ref-1',
        success: false,
      });
      await service.handleWebhook('stripe', Buffer.alloc(0), 'sig');

      let updated = await service.findByIdOrThrow(campaign._id.toString());
      expect(updated.status).toBe('pending_payment');
      expect(updated.paymentStatus).toBe('failed');

      // Retry: still pending_payment, so initiateCampaignPayment works again.
      await service.initiateCampaignPayment(
        campaign._id.toString(),
        owner,
        'stripe',
      );
      stripeAdapter.handleWebhook.mockResolvedValue({
        reference: 'stripe-ref-1',
        success: true,
      });
      await service.handleWebhook('stripe', Buffer.alloc(0), 'sig');

      updated = await service.findByIdOrThrow(campaign._id.toString());
      expect(updated.status).toBe('active');
      expect(updated.paymentStatus).toBe('succeeded');
    });

    it("ignores a webhook whose provider does not match the campaign's own payment provider", async () => {
      const restaurant = await createOwnedRestaurant('owner-9');
      const campaign = await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: new Date().toISOString(),
          durationDays: 7,
        },
        admin,
      );
      await service.initiateCampaignPayment(
        campaign._id.toString(),
        {
          sub: 'owner-9',
          email: 'owner9@example.com',
          role: 'restaurant_owner',
        },
        'stripe',
      ); // sets paymentProvider: 'stripe'

      // A paystack webhook arrives referencing the same reference string — should be ignored,
      // since this campaign's live provider is stripe.
      paystackAdapterMock.handleWebhook.mockResolvedValue({
        reference: 'stripe-ref-1',
        success: true,
      });
      await service.handleWebhook('paystack', Buffer.alloc(0), 'sig');

      const updated = await service.findByIdOrThrow(campaign._id.toString());
      expect(updated.status).toBe('pending_payment');
    });
  });

  describe('markPaidManually', () => {
    it('activates a same-day campaign the same way an online payment would', async () => {
      const restaurant = await createOwnedRestaurant('owner-10');
      const campaign = await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: new Date().toISOString(),
          durationDays: 7,
        },
        admin,
      );
      const updated = await service.markPaidManually(
        campaign._id.toString(),
        admin,
      );
      expect(updated.status).toBe('active');
      expect(updated.markedPaidManually).toBe(true);

      const updatedRestaurant = await restaurantModel
        .findById(restaurant._id)
        .exec();
      expect(updatedRestaurant!.isSponsored).toBe(true);
    });
  });

  describe('ownership', () => {
    it('rejects pay/verify/findOne for a restaurant_owner who does not own the target restaurant', async () => {
      const restaurant = await createOwnedRestaurant('real-owner');
      const campaign = await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: new Date().toISOString(),
          durationDays: 7,
        },
        admin,
      );
      const stranger: AccessTokenPayload = {
        sub: 'stranger-id',
        email: 'stranger@example.com',
        role: 'restaurant_owner',
      };

      await expect(
        service.initiateCampaignPayment(campaign._id.toString(), stranger),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.verifyPayment(campaign._id.toString(), stranger),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.findOneForRequester(campaign._id.toString(), stranger),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the real owner through', async () => {
      const restaurant = await createOwnedRestaurant('real-owner-2');
      const campaign = await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: new Date().toISOString(),
          durationDays: 7,
        },
        admin,
      );
      const owner: AccessTokenPayload = {
        sub: 'real-owner-2',
        email: 'owner@example.com',
        role: 'restaurant_owner',
      };
      const found = await service.findOneForRequester(
        campaign._id.toString(),
        owner,
      );
      expect(found._id.toString()).toBe(campaign._id.toString());
    });
  });

  describe('cancel', () => {
    it('cancels a pending_payment campaign', async () => {
      const restaurant = await createOwnedRestaurant('owner-11');
      const campaign = await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: new Date().toISOString(),
          durationDays: 7,
        },
        admin,
      );
      const cancelled = await service.cancel(
        campaign._id.toString(),
        'no longer needed',
      );
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelReason).toBe('no longer needed');
    });

    it('refuses to cancel an already-active campaign — a paid, live campaign always runs to its natural end date', async () => {
      const restaurant = await createOwnedRestaurant('owner-12');
      const campaign = await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: new Date().toISOString(),
          durationDays: 7,
        },
        admin,
      );
      await service.markPaidManually(campaign._id.toString(), admin);

      await expect(
        service.cancel(campaign._id.toString(), 'changed my mind'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('runLifecycleSweep', () => {
    it('activates a scheduled campaign whose startDate has arrived and sponsors the vendor', async () => {
      const restaurant = await createOwnedRestaurant('owner-13');
      const past = new Date();
      past.setDate(past.getDate() - 1);
      const future = new Date();
      future.setDate(future.getDate() + 10);

      const doc = await adCampaignModel.create({
        restaurantId: restaurant._id,
        status: 'scheduled',
        paymentStatus: 'succeeded',
        startDate: past,
        endDate: future,
        durationDays: 7,
        currency: 'NGN',
        dailyRate: 5000,
        totalPrice: 35000,
        createdByAdminId: admin.sub,
      });

      const result = await service.runLifecycleSweep();
      expect(result.activated).toBe(1);

      const updated = await adCampaignModel.findById(doc._id).exec();
      expect(updated!.status).toBe('active');

      const updatedRestaurant = await restaurantModel
        .findById(restaurant._id)
        .exec();
      expect(updatedRestaurant!.isSponsored).toBe(true);
    });

    it('ends an active campaign whose endDate has passed and clears the vendor sponsorship', async () => {
      const restaurant = await createOwnedRestaurant('owner-14');
      const past = new Date();
      past.setDate(past.getDate() - 10);
      const recentPast = new Date();
      recentPast.setDate(recentPast.getDate() - 1);

      const doc = await adCampaignModel.create({
        restaurantId: restaurant._id,
        status: 'active',
        paymentStatus: 'succeeded',
        startDate: past,
        endDate: recentPast,
        durationDays: 7,
        currency: 'NGN',
        dailyRate: 5000,
        totalPrice: 35000,
        createdByAdminId: admin.sub,
      });
      await restaurantsService.setSponsorship(
        restaurant._id.toString(),
        recentPast,
      );

      const result = await service.runLifecycleSweep();
      expect(result.ended).toBe(1);

      const updated = await adCampaignModel.findById(doc._id).exec();
      expect(updated!.status).toBe('ended');

      const updatedRestaurant = await restaurantModel
        .findById(restaurant._id)
        .exec();
      expect(updatedRestaurant!.isSponsored).toBe(false);
      expect(updatedRestaurant!.sponsoredUntil).toBeNull();
    });

    it('leaves a campaign untouched if it is not yet due either way', async () => {
      const restaurant = await createOwnedRestaurant('owner-15');
      const future = new Date();
      future.setDate(future.getDate() + 5);
      const furtherFuture = new Date();
      furtherFuture.setDate(furtherFuture.getDate() + 12);

      await adCampaignModel.create({
        restaurantId: restaurant._id,
        status: 'scheduled',
        paymentStatus: 'succeeded',
        startDate: future,
        endDate: furtherFuture,
        durationDays: 7,
        currency: 'NGN',
        dailyRate: 5000,
        totalPrice: 35000,
        createdByAdminId: admin.sub,
      });

      const result = await service.runLifecycleSweep();
      expect(result.activated).toBe(0);
      expect(result.ended).toBe(0);
    });
  });

  describe('findAllForAdmin', () => {
    it('does not crash on a legacy-shaped document whose restaurantId/storeId is genuinely undefined', async () => {
      // Mirrors PromoCodesService's own FDP-114 regression test — bypasses the service entirely
      // to simulate a document that predates strict field population.
      await adCampaignModel.collection.insertOne({
        status: 'cancelled',
        paymentStatus: 'pending',
        startDate: new Date(),
        endDate: new Date(),
        durationDays: 7,
        currency: 'NGN',
        dailyRate: 5000,
        totalPrice: 35000,
        priceOverridden: false,
        paymentRefs: [],
        markedPaidManually: false,
        adminNotes: '',
        createdByAdminId: admin.sub,
        createdAt: new Date(),
        updatedAt: new Date(),
        // restaurantId/storeId deliberately absent.
      });

      const all = await service.findAllForAdmin();
      const legacy = all.find((c) => c.status === 'cancelled');
      expect(legacy?.vendor.name).toBe('Unknown vendor');
    });

    it('enriches with the real vendor name for a restaurant-scoped campaign', async () => {
      const restaurant = await createOwnedRestaurant(
        'owner-16',
        'Golden Spoon',
      );
      await service.create(
        {
          restaurantId: restaurant._id.toString(),
          startDate: new Date().toISOString(),
          durationDays: 7,
        },
        admin,
      );

      const all = await service.findAllForAdmin();
      const found = all.find((c) => c.vendor.type === 'restaurant');
      expect(found?.vendor).toEqual({
        type: 'restaurant',
        id: restaurant._id.toString(),
        name: 'Golden Spoon',
      });
    });
  });

  describe('findAllForAdminPaginated (docs/ROADMAP.md FDP-128)', () => {
    it('paginates and totals only succeeded campaigns, grouped by currency, over the whole filtered set', async () => {
      const restaurantA = await createOwnedRestaurant('owner-tx-1', 'Ad Buyer A');
      const restaurantB = await createOwnedRestaurant('owner-tx-2', 'Ad Buyer B');

      const campaignA = await service.create(
        { restaurantId: restaurantA._id.toString(), startDate: new Date().toISOString(), durationDays: 7 },
        admin,
      );
      await service.markPaidManually(campaignA._id.toString(), admin); // succeeded, NGN 35000

      const campaignB = await service.create(
        { restaurantId: restaurantB._id.toString(), startDate: new Date().toISOString(), durationDays: 7 },
        admin,
      );
      // Left pending_payment on purpose — must not count toward totalsByCurrency.
      void campaignB;

      const result = await service.findAllForAdminPaginated({ page: 1, limit: 1 });
      expect(result.total).toBe(2); // both campaigns are listed...
      expect(result.items).toHaveLength(1); // ...but only 1 fits on this page
      expect(result.totalsByCurrency).toEqual({ NGN: 35000 }); // totals reflect the whole set, not just the page
    });

    it('filters by createdAt date range', async () => {
      const restaurant = await createOwnedRestaurant('owner-tx-3');
      const inRange = await service.create(
        { restaurantId: restaurant._id.toString(), startDate: new Date().toISOString(), durationDays: 7 },
        admin,
      );

      const restaurant2 = await createOwnedRestaurant('owner-tx-4');
      const outOfRange = await service.create(
        { restaurantId: restaurant2._id.toString(), startDate: new Date().toISOString(), durationDays: 7 },
        admin,
      );
      // Mongoose marks `createdAt` immutable by default under `timestamps: true` — a Mongoose
      // `updateOne`/`$set` on it is silently stripped, so the raw collection driver is required
      // to actually move a fixture's createdAt into the past for this test.
      const past = new Date();
      past.setDate(past.getDate() - 30);
      await adCampaignModel.collection.updateOne(
        { _id: outOfRange._id },
        { $set: { createdAt: past } },
      );

      const from = new Date();
      from.setDate(from.getDate() - 1);
      const result = await service.findAllForAdminPaginated({
        from: from.toISOString(),
        page: 1,
        limit: 20,
      });
      expect(result.items.map((c) => c._id.toString())).toEqual([inRange._id.toString()]);
    });
  });
});
