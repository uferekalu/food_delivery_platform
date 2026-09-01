import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { ReviewsService } from './reviews.service';
import { Review, ReviewDocument, ReviewSchema } from './schemas/review.schema';
import { OrdersService } from '../orders/orders.service';
import { CartService } from '../cart/cart.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { PromoCodesService } from '../promo-codes/promo-codes.service';
import { PaymentProviderResolver } from '../payments/provider-resolver';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { RidersService } from '../riders/riders.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
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
import { User, UserDocument, UserSchema } from '../users/schemas/user.schema';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';

jest.setTimeout(30_000);

describe('ReviewsService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let reviewsService: ReviewsService;
  let restaurantsService: RestaurantsService;
  let ridersService: RidersService;
  let reviewModel: Model<ReviewDocument>;
  let orderModel: Model<OrderDocument>;
  let restaurantModel: Model<RestaurantDocument>;
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
          { name: PromoCode.name, schema: PromoCodeSchema },
          { name: DeliveryZone.name, schema: DeliveryZoneSchema },
          { name: Rider.name, schema: RiderSchema },
          { name: User.name, schema: UserSchema },
        ]),
      ],
      providers: [
        ReviewsService,
        OrdersService,
        CartService,
        RestaurantsService,
        PromoCodesService,
        PaymentProviderResolver,
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
      ],
    }).compile();

    reviewsService = moduleRef.get(ReviewsService);
    restaurantsService = moduleRef.get(RestaurantsService);
    ridersService = moduleRef.get(RidersService);
    reviewModel = moduleRef.get(getModelToken(Review.name));
    orderModel = moduleRef.get(getModelToken(Order.name));
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    riderModel = moduleRef.get(getModelToken(Rider.name));
    userModel = moduleRef.get(getModelToken(User.name));
  }, 60_000);

  afterEach(async () => {
    await Promise.all([
      reviewModel.deleteMany({}).exec(),
      orderModel.deleteMany({}).exec(),
      restaurantModel.deleteMany({}).exec(),
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
    });
    return restaurantsService.approve(restaurant._id.toString());
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
      { vehicleType: 'motorcycle' },
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
      expect(eligibility).toEqual({ restaurant: true, rider: true });
    });

    it('is not eligible for rider when no rider was assigned', async () => {
      const restaurant = await createRestaurant();
      const order = await seedOrder(restaurant._id.toString(), 'DELIVERED');

      const eligibility = await reviewsService.getEligibility(
        customer,
        order._id.toString(),
      );
      expect(eligibility).toEqual({ restaurant: true, rider: false });
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
      expect(eligibility).toEqual({ restaurant: false, rider: false });
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
