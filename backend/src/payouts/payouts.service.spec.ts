import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { PayoutsService } from './payouts.service';
import {
  Order,
  OrderDocument,
  OrderSchema,
} from '../orders/schemas/order.schema';

jest.setTimeout(30_000);

describe('PayoutsService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let payoutsService: PayoutsService;
  let orderModel: Model<OrderDocument>;

  beforeAll(async () => {
    // See backend/CLAUDE.md ("Testing") for why launchTimeout is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
      ],
      providers: [PayoutsService],
    }).compile();

    payoutsService = moduleRef.get(PayoutsService);
    orderModel = moduleRef.get(getModelToken(Order.name));
  }, 60_000);

  afterEach(async () => {
    await orderModel.deleteMany({}).exec();
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  let orderCounter = 0;

  // A fresh, unique orderNumber every call — orderNumber has a unique index, so reusing the
  // same literal across `orderModel.create()` calls in one test (easy to do when most fields
  // are shared boilerplate) throws a duplicate-key error instead of a useful assertion failure.
  function createOrder(overrides: Record<string, unknown>) {
    orderCounter += 1;
    return orderModel.create({
      orderNumber: `ORD-${orderCounter}`,
      customerId: 'customer-id',
      items: [
        {
          name: 'Item',
          price: 10,
          qty: 1,
          selectedModifiers: [],
          notes: '',
        },
      ],
      subtotal: 100,
      deliveryFee: 15,
      serviceFee: 5,
      tax: 0,
      discount: 0,
      total: 120,
      platformFeeAmount: 15,
      restaurantPayoutAmount: 85,
      status: 'DELIVERED',
      statusHistory: [
        { status: 'DELIVERED', at: new Date(), by: 'customer-id' },
      ],
      paymentProvider: 'stripe',
      paymentStatus: 'succeeded',
      deliveryAddress: { line1: '1 St', city: 'Lagos', state: 'Lagos' },
      vendorPayoutId: null,
      riderPayoutId: null,
      ...overrides,
    });
  }

  describe('getUnpaidVendorEarnings', () => {
    it('sums restaurantPayoutAmount across unpaid DELIVERED orders for a restaurant', async () => {
      await createOrder({
        sellerType: 'restaurant',
        restaurantId: 'restaurant-1',
        currency: 'NGN',
      });
      await createOrder({
        sellerType: 'restaurant',
        restaurantId: 'restaurant-1',
        currency: 'NGN',
        restaurantPayoutAmount: 50,
      });

      const result = await payoutsService.getUnpaidVendorEarnings(
        'restaurant',
        'restaurant-1',
      );
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe('stripe');
      expect(result[0].currency).toBe('NGN');
      expect(result[0].grossAmount).toBe(135);
      expect(result[0].orderIds).toHaveLength(2);
    });

    it('excludes an order already settled via the instant charge-time split (docs/ROADMAP.md FDP-92) — paying it out again would double-pay the vendor', async () => {
      await createOrder({
        sellerType: 'restaurant',
        restaurantId: 'restaurant-1',
        currency: 'NGN',
        settledViaInstantSplit: true,
      });

      const result = await payoutsService.getUnpaidVendorEarnings(
        'restaurant',
        'restaurant-1',
      );
      expect(result).toEqual([]);
    });

    it('excludes orders already included in a payout', async () => {
      await createOrder({
        sellerType: 'restaurant',
        restaurantId: 'restaurant-1',
        currency: 'NGN',
        vendorPayoutId: 'already-paid-out',
      });

      const result = await payoutsService.getUnpaidVendorEarnings(
        'restaurant',
        'restaurant-1',
      );
      expect(result).toEqual([]);
    });

    it('excludes orders that are not DELIVERED yet', async () => {
      await createOrder({
        sellerType: 'restaurant',
        restaurantId: 'restaurant-1',
        currency: 'NGN',
        status: 'OUT_FOR_DELIVERY',
      });

      const result = await payoutsService.getUnpaidVendorEarnings(
        'restaurant',
        'restaurant-1',
      );
      expect(result).toEqual([]);
    });

    it("does not mix a different restaurant's or a store's orders in", async () => {
      await createOrder({
        sellerType: 'restaurant',
        restaurantId: 'restaurant-1',
        currency: 'NGN',
      });
      await createOrder({
        sellerType: 'restaurant',
        restaurantId: 'restaurant-2',
        currency: 'NGN',
      });
      await createOrder({
        sellerType: 'store',
        storeId: 'restaurant-1', // deliberately the same raw id value, different sellerType
        currency: 'NGN',
      });

      const result = await payoutsService.getUnpaidVendorEarnings(
        'restaurant',
        'restaurant-1',
      );
      expect(result[0].orderIds).toHaveLength(1);
    });

    it('groups by currency when a vendor has orders in more than one', async () => {
      await createOrder({
        sellerType: 'restaurant',
        restaurantId: 'restaurant-1',
        currency: 'NGN',
      });
      await createOrder({
        sellerType: 'restaurant',
        restaurantId: 'restaurant-1',
        currency: 'USD',
        restaurantPayoutAmount: 20,
      });

      const result = await payoutsService.getUnpaidVendorEarnings(
        'restaurant',
        'restaurant-1',
      );
      expect(result).toHaveLength(2);
      expect(result.find((r) => r.currency === 'NGN')?.grossAmount).toBe(85);
      expect(result.find((r) => r.currency === 'USD')?.grossAmount).toBe(20);
    });

    it('works for a store the same way it does for a restaurant', async () => {
      await createOrder({
        sellerType: 'store',
        storeId: 'store-1',
        currency: 'NGN',
      });

      const result = await payoutsService.getUnpaidVendorEarnings(
        'store',
        'store-1',
      );
      expect(result).toHaveLength(1);
      expect(result[0].currency).toBe('NGN');
      expect(result[0].grossAmount).toBe(85);
    });

    it('keeps orders from the same currency but different providers in separate groups', async () => {
      // Real transfer execution (docs/ROADMAP.md FDP-92) has to send a group's payout out
      // through the same provider that actually collected the money — merging them here would
      // make that impossible to do correctly downstream.
      await createOrder({
        sellerType: 'restaurant',
        restaurantId: 'restaurant-1',
        currency: 'NGN',
        paymentProvider: 'stripe',
      });
      await createOrder({
        sellerType: 'restaurant',
        restaurantId: 'restaurant-1',
        currency: 'NGN',
        paymentProvider: 'paystack',
        restaurantPayoutAmount: 50,
      });

      const result = await payoutsService.getUnpaidVendorEarnings(
        'restaurant',
        'restaurant-1',
      );
      expect(result).toHaveLength(2);
      expect(result.find((r) => r.provider === 'stripe')?.grossAmount).toBe(85);
      expect(result.find((r) => r.provider === 'paystack')?.grossAmount).toBe(
        50,
      );
    });
  });

  describe('getUnpaidRiderEarnings', () => {
    it('sums deliveryFee (not restaurantPayoutAmount) across unpaid DELIVERED orders for a rider', async () => {
      await createOrder({
        sellerType: 'restaurant',
        restaurantId: 'restaurant-1',
        riderId: 'rider-1',
        currency: 'NGN',
        deliveryFee: 15,
      });
      await createOrder({
        sellerType: 'store',
        storeId: 'store-1',
        riderId: 'rider-1',
        currency: 'NGN',
        deliveryFee: 25,
      });

      const result = await payoutsService.getUnpaidRiderEarnings('rider-1');
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe('stripe');
      expect(result[0].currency).toBe('NGN');
      expect(result[0].grossAmount).toBe(40);
    });

    it('excludes orders already included in a rider payout, independent of the vendor payout state', async () => {
      await createOrder({
        sellerType: 'restaurant',
        restaurantId: 'restaurant-1',
        riderId: 'rider-1',
        currency: 'NGN',
        vendorPayoutId: null,
        riderPayoutId: 'already-paid-out',
      });

      const result = await payoutsService.getUnpaidRiderEarnings('rider-1');
      expect(result).toEqual([]);
    });

    it('excludes orders belonging to a different rider', async () => {
      await createOrder({
        sellerType: 'restaurant',
        restaurantId: 'restaurant-1',
        riderId: 'rider-2',
        currency: 'NGN',
      });

      const result = await payoutsService.getUnpaidRiderEarnings('rider-1');
      expect(result).toEqual([]);
    });
  });
});
