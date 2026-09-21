import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { ReviewsService } from './reviews.service';
import { Review, ReviewDocument, ReviewSchema } from './schemas/review.schema';
import { OrdersService } from '../orders/orders.service';
import { TaxResolver } from '../orders/tax-resolver';
import { CartService } from '../cart/cart.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StoresService } from '../stores/stores.service';
import { PromoCodesService } from '../promo-codes/promo-codes.service';
import { PaymentProviderResolver } from '../payments/provider-resolver';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { RidersService } from '../riders/riders.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BusinessVerificationService } from '../business-verification/business-verification.service';
import {
  Order,
  OrderDocument,
  OrderSchema,
} from '../orders/schemas/order.schema';
import type { OrderStatus } from '../orders/schemas/order-status';
import { Cart, CartSchema } from '../cart/schemas/cart.schema';
import {
  Restaurant,
  RestaurantDocument,
  RestaurantSchema,
} from '../restaurants/schemas/restaurant.schema';
import { MenuItem, MenuItemSchema } from '../menu/schemas/menu-item.schema';
import {
  Store,
  StoreDocument,
  StoreSchema,
} from '../stores/schemas/store.schema';
import { Product, ProductSchema } from '../stores/schemas/product.schema';
import {
  PromoCode,
  PromoCodeSchema,
} from '../promo-codes/schemas/promo-code.schema';
import {
  DeliveryZone,
  DeliveryZoneSchema,
} from '../delivery-zones/schemas/delivery-zone.schema';
import {
  Rider,
  RiderDocument,
  RiderSchema,
} from '../riders/schemas/rider.schema';
import {
  PayoutClawback,
  PayoutClawbackSchema,
} from '../payouts/schemas/payout-clawback.schema';
import { User, UserDocument, UserSchema } from '../users/schemas/user.schema';
import {
  RefreshToken,
  RefreshTokenSchema,
} from '../auth/schemas/refresh-token.schema';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';

jest.setTimeout(30_000);

describe('ReviewsService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let reviewsService: ReviewsService;
  let restaurantsService: RestaurantsService;
  let storesService: StoresService;
  let ridersService: RidersService;
  let reviewModel: Model<ReviewDocument>;
  let orderModel: Model<OrderDocument>;
  let restaurantModel: Model<RestaurantDocument>;
  let storeModel: Model<StoreDocument>;
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
          { name: Review.name, schema: ReviewSchema },
          { name: Order.name, schema: OrderSchema },
          { name: Cart.name, schema: CartSchema },
          { name: Restaurant.name, schema: RestaurantSchema },
          { name: MenuItem.name, schema: MenuItemSchema },
          { name: Store.name, schema: StoreSchema },
          { name: Product.name, schema: ProductSchema },
          { name: PromoCode.name, schema: PromoCodeSchema },
          { name: DeliveryZone.name, schema: DeliveryZoneSchema },
          { name: Rider.name, schema: RiderSchema },
          { name: User.name, schema: UserSchema },
          { name: RefreshToken.name, schema: RefreshTokenSchema },
          { name: PayoutClawback.name, schema: PayoutClawbackSchema },
        ]),
      ],
      providers: [
        ReviewsService,
        OrdersService,
        CartService,
        RestaurantsService,
        StoresService,
        PromoCodesService,
        PaymentProviderResolver,
        TaxResolver,
        DeliveryZonesService,
        RidersService,
        UsersService,
        {
          provide: RealtimeGateway,
          useValue: { emitOrderStatusChanged: jest.fn() },
        },
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn().mockResolvedValue(undefined) },
        },
        {
          // Not exercised by this suite (docs/ROADMAP.md FDP-115) — a bare no-op mock.
          provide: BusinessVerificationService,
          useValue: {
            verifyBusinessRegistration: jest.fn().mockResolvedValue({
              outcome: 'unknown',
              reason: 'not configured',
            }),
          },
        },
      ],
    }).compile();

    reviewsService = moduleRef.get(ReviewsService);
    restaurantsService = moduleRef.get(RestaurantsService);
    storesService = moduleRef.get(StoresService);
    ridersService = moduleRef.get(RidersService);
    reviewModel = moduleRef.get(getModelToken(Review.name));
    orderModel = moduleRef.get(getModelToken(Order.name));
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    storeModel = moduleRef.get(getModelToken(Store.name));
    riderModel = moduleRef.get(getModelToken(Rider.name));
    userModel = moduleRef.get(getModelToken(User.name));
  }, 60_000);

  afterEach(async () => {
    await Promise.all([
      reviewModel.deleteMany({}).exec(),
      orderModel.deleteMany({}).exec(),
      restaurantModel.deleteMany({}).exec(),
      storeModel.deleteMany({}).exec(),
      riderModel.deleteMany({}).exec(),
      userModel.deleteMany({}).exec(),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  const customerId = '507f1f77bcf86cd799439011';
  const customer: AccessTokenPayload = {
    sub: customerId,
    email: 'customer@example.com',
    role: 'customer',
  };

  async function createRestaurant() {
    const restaurant = await restaurantsService.create('owner-id', {
      name: 'Burgundy Kitchen',
      cuisineTypes: ['Nigerian'],
      currency: 'NGN',
      country: 'Nigeria',
      address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
      complianceDocumentUrl: 'https://example.com/doc.pdf',
      businessRegistrationNumber: 'RC1234567',
    });
    return restaurantsService.approve(restaurant._id.toString());
  }

  async function createStore() {
    const store = await storesService.create('store-owner-id', {
      name: 'Market Square Supermarket',
      type: 'groceries',
      currency: 'NGN',
      country: 'Nigeria',
      address: { line1: '1 Market Rd', city: 'Lagos', state: 'Lagos' },
      complianceDocumentUrl: 'https://example.com/doc.pdf',
      businessRegistrationNumber: 'RC7654321',
    });
    return storesService.approve(store._id.toString());
  }

  async function createVerifiedRider(userId: string) {
    const user = await userModel.create({
      _id: userId,
      email: `rider-${userId}@example.com`,
      passwordHash: 'hashed',
      name: 'Test Rider',
      role: 'customer',
    });
    const rider = await ridersService.apply(
      { sub: user._id.toString(), email: user.email, role: 'customer' },
      {
        phone: '+2348011122233',
        vehicleType: 'motorcycle',
        dateOfBirth: '1995-06-15',
        governmentIdType: 'national_id',
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
      },
    );
    await ridersService.verify(rider._id.toString());
    return rider;
  }

  async function seedOrder(
    restaurantId: string,
    status: OrderStatus,
    riderId: string | null = null,
  ) {
    return orderModel.create({
      orderNumber: `ORD-TEST-${Math.random().toString(36).slice(2, 8)}`,
      customerId,
      restaurantId,
      riderId,
      items: [
        {
          menuItemId: restaurantId,
          name: 'Jollof Rice',
          price: 10,
          qty: 1,
          selectedModifiers: [],
          notes: '',
        },
      ],
      subtotal: 10,
      deliveryFee: 1,
      serviceFee: 0.5,
      tax: 0,
      discount: 0,
      total: 11.5,
      platformFeeAmount: 1.5,
      restaurantPayoutAmount: 8.5,
      currency: 'NGN',
      status,
      statusHistory: [{ status, at: new Date(), by: customerId }],
      paymentProvider: 'paystack',
      paymentStatus: 'succeeded',
      deliveryAddress: { line1: '1 St', city: 'Lagos', state: 'Lagos' },
    });
  }

  /** Store-order counterpart of seedOrder (docs/ROADMAP.md FDP-136) — a separate helper rather
   * than adding a sellerType param to seedOrder, so the many existing restaurant-order tests
   * above stay untouched. */
  async function seedStoreOrder(
    storeId: string,
    status: OrderStatus,
    riderId: string | null = null,
  ) {
    return orderModel.create({
      orderNumber: `ORD-TEST-${Math.random().toString(36).slice(2, 8)}`,
      customerId,
      sellerType: 'store',
      storeId,
      riderId,
      items: [
        {
          productId: storeId,
          name: 'Bag of Rice',
          price: 10,
          qty: 1,
          selectedModifiers: [],
          notes: '',
        },
      ],
      subtotal: 10,
      deliveryFee: 1,
      serviceFee: 0.5,
      tax: 0,
      discount: 0,
      total: 11.5,
      platformFeeAmount: 1.5,
      restaurantPayoutAmount: 8.5,
      currency: 'NGN',
      status,
      statusHistory: [{ status, at: new Date(), by: customerId }],
      paymentProvider: 'paystack',
      paymentStatus: 'succeeded',
      deliveryAddress: { line1: '1 St', city: 'Lagos', state: 'Lagos' },
    });
  }

  describe('create — restaurant reviews', () => {
    it('creates a review and recomputes the restaurant avgRating/reviewCount', async () => {
      const restaurant = await createRestaurant();
      const order = await seedOrder(restaurant._id.toString(), 'DELIVERED');

      const review = await reviewsService.create(customer, {
        targetType: 'restaurant',
        orderId: order._id.toString(),
        rating: 4,
        comment: 'Great food',
      });

      expect(review.targetId.toString()).toBe(restaurant._id.toString());
      const updated = await restaurantModel.findById(restaurant._id).exec();
      expect(updated?.avgRating).toBe(4);
      expect(updated?.reviewCount).toBe(1);
    });

    it('averages multiple reviews correctly', async () => {
      const restaurant = await createRestaurant();
      const order1 = await seedOrder(restaurant._id.toString(), 'DELIVERED');
      const order2 = await seedOrder(restaurant._id.toString(), 'DELIVERED');

      await reviewsService.create(customer, {
        targetType: 'restaurant',
        orderId: order1._id.toString(),
        rating: 5,
      });
      await reviewsService.create(customer, {
        targetType: 'restaurant',
        orderId: order2._id.toString(),
        rating: 3,
      });

      const updated = await restaurantModel.findById(restaurant._id).exec();
      expect(updated?.avgRating).toBe(4);
      expect(updated?.reviewCount).toBe(2);
    });

    it('rejects reviewing an order that is not yet delivered', async () => {
      const restaurant = await createRestaurant();
      const order = await seedOrder(
        restaurant._id.toString(),
        'OUT_FOR_DELIVERY',
      );

      await expect(
        reviewsService.create(customer, {
          targetType: 'restaurant',
          orderId: order._id.toString(),
          rating: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a second review for the same order/target', async () => {
      const restaurant = await createRestaurant();
      const order = await seedOrder(restaurant._id.toString(), 'DELIVERED');
      await reviewsService.create(customer, {
        targetType: 'restaurant',
        orderId: order._id.toString(),
        rating: 5,
      });

      await expect(
        reviewsService.create(customer, {
          targetType: 'restaurant',
          orderId: order._id.toString(),
          rating: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a reviewer who is not the order customer', async () => {
      const restaurant = await createRestaurant();
      const order = await seedOrder(restaurant._id.toString(), 'DELIVERED');
      const intruder: AccessTokenPayload = {
        sub: 'someone-else',
        email: 'intruder@example.com',
        role: 'customer',
      };

      await expect(
        reviewsService.create(intruder, {
          targetType: 'restaurant',
          orderId: order._id.toString(),
          rating: 5,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create — rider reviews', () => {
    it('creates a rider review and recomputes the rider rating/reviewCount', async () => {
      const restaurant = await createRestaurant();
      const rider = await createVerifiedRider('507f1f77bcf86cd799439099');
      const order = await seedOrder(
        restaurant._id.toString(),
        'DELIVERED',
        rider.userId.toString(),
      );

      await reviewsService.create(customer, {
        targetType: 'rider',
        orderId: order._id.toString(),
        rating: 5,
      });

      const updated = await riderModel.findById(rider._id).exec();
      expect(updated?.rating).toBe(5);
      expect(updated?.reviewCount).toBe(1);
    });

    it('rejects a rider review when the order had no rider assigned', async () => {
      const restaurant = await createRestaurant();
      const order = await seedOrder(restaurant._id.toString(), 'DELIVERED');

      await expect(
        reviewsService.create(customer, {
          targetType: 'rider',
          orderId: order._id.toString(),
          rating: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getEligibility', () => {
    it('is eligible for both target types on a fresh delivered order with a rider', async () => {
      const restaurant = await createRestaurant();
      const rider = await createVerifiedRider('507f1f77bcf86cd799439098');
      const order = await seedOrder(
        restaurant._id.toString(),
        'DELIVERED',
        rider.userId.toString(),
      );

      const eligibility = await reviewsService.getEligibility(
        customer,
        order._id.toString(),
      );
      expect(eligibility).toEqual({ restaurant: true, store: false, rider: true });
    });

    it('is not eligible for rider when no rider was assigned', async () => {
      const restaurant = await createRestaurant();
      const order = await seedOrder(restaurant._id.toString(), 'DELIVERED');

      const eligibility = await reviewsService.getEligibility(
        customer,
        order._id.toString(),
      );
      expect(eligibility).toEqual({ restaurant: true, store: false, rider: false });
    });

    it('is not eligible for a target already reviewed', async () => {
      const restaurant = await createRestaurant();
      const order = await seedOrder(restaurant._id.toString(), 'DELIVERED');
      await reviewsService.create(customer, {
        targetType: 'restaurant',
        orderId: order._id.toString(),
        rating: 4,
      });

      const eligibility = await reviewsService.getEligibility(
        customer,
        order._id.toString(),
      );
      expect(eligibility.restaurant).toBe(false);
    });

    it('is not eligible at all for an order that is not delivered yet', async () => {
      const restaurant = await createRestaurant();
      const order = await seedOrder(restaurant._id.toString(), 'PREPARING');

      const eligibility = await reviewsService.getEligibility(
        customer,
        order._id.toString(),
      );
      expect(eligibility).toEqual({ restaurant: false, store: false, rider: false });
    });

    it('is eligible for store (not restaurant) on a delivered store order, and store reviews recompute Store.avgRating (FDP-136)', async () => {
      const store = await createStore();
      const rider = await createVerifiedRider('507f1f77bcf86cd799439099');
      const order = await seedStoreOrder(
        store._id.toString(),
        'DELIVERED',
        rider.userId.toString(),
      );

      const eligibility = await reviewsService.getEligibility(
        customer,
        order._id.toString(),
      );
      // The bug this fixes: previously `restaurant` came back `true` for every store order
      // (nothing gated it on order.restaurantId actually being set), which would have rendered
      // a "Rate this restaurant" form the backend would then reject if ever submitted.
      expect(eligibility).toEqual({ restaurant: false, store: true, rider: true });

      const review = await reviewsService.create(customer, {
        targetType: 'store',
        orderId: order._id.toString(),
        rating: 5,
        comment: 'Fresh produce, fast delivery',
      });
      expect(review.targetId.toString()).toBe(store._id.toString());

      const updatedStore = await storeModel.findById(store._id).exec();
      expect(updatedStore?.avgRating).toBe(5);
      expect(updatedStore?.reviewCount).toBe(1);

      const afterReview = await reviewsService.getEligibility(
        customer,
        order._id.toString(),
      );
      expect(afterReview.store).toBe(false);
    });

    it('rejects reviewing a store order as targetType "restaurant"', async () => {
      const store = await createStore();
      const order = await seedStoreOrder(store._id.toString(), 'DELIVERED');

      await expect(
        reviewsService.create(customer, {
          targetType: 'restaurant',
          orderId: order._id.toString(),
          rating: 3,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findForTarget', () => {
    it('paginates and sorts newest first', async () => {
      const restaurant = await restaurantModel.create({
        ownerId: 'owner-id',
        name: 'Test Place',
        slug: 'test-place',
        cuisineTypes: ['Test'],
        currency: 'NGN',
        country: 'Nigeria',
        address: { line1: '1 St', city: 'Lagos', state: 'Lagos' },
        isApproved: true,
      });
      await userModel.create({
        _id: customerId,
        email: 'customer@example.com',
        passwordHash: 'hashed',
        name: 'Test Customer',
        role: 'customer',
      });

      const order1 = await seedOrder(restaurant._id.toString(), 'DELIVERED');
      await reviewsService.create(customer, {
        targetType: 'restaurant',
        orderId: order1._id.toString(),
        rating: 5,
        comment: 'First',
      });
      const order2 = await seedOrder(restaurant._id.toString(), 'DELIVERED');
      await reviewsService.create(customer, {
        targetType: 'restaurant',
        orderId: order2._id.toString(),
        rating: 3,
        comment: 'Second',
      });

      const result = await reviewsService.findForTarget({
        targetType: 'restaurant',
        targetId: restaurant._id.toString(),
        page: 1,
        limit: 20,
      });

      expect(result.total).toBe(2);
      expect(result.items[0].comment).toBe('Second'); // newest first
      expect(result.items[0].authorId).toMatchObject({ name: 'Test Customer' });
    });
  });
});
