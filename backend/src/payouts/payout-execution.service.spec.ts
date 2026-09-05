import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { PayoutExecutionService } from './payout-execution.service';
import { PayoutsService } from './payouts.service';
import { Payout, PayoutDocument, PayoutSchema } from './schemas/payout.schema';
import {
  Order,
  OrderDocument,
  OrderSchema,
} from '../orders/schemas/order.schema';
import {
  Restaurant,
  RestaurantDocument,
  RestaurantSchema,
} from '../restaurants/schemas/restaurant.schema';
import {
  Store,
  StoreDocument,
  StoreSchema,
} from '../stores/schemas/store.schema';
import {
  Rider,
  RiderDocument,
  RiderSchema,
} from '../riders/schemas/rider.schema';
import { StripeAdapter } from '../payments/adapters/stripe.adapter';
import { PaystackAdapter } from '../payments/adapters/paystack.adapter';
import { FlutterwaveAdapter } from '../payments/adapters/flutterwave.adapter';
import { TransferOutcomeUnknownError } from '../payments/adapters/transfer-outcome-unknown.error';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

jest.setTimeout(30_000);

describe('PayoutExecutionService (docs/ROADMAP.md FDP-92)', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let executionService: PayoutExecutionService;
  let orderModel: Model<OrderDocument>;
  let payoutModel: Model<PayoutDocument>;
  let restaurantModel: Model<RestaurantDocument>;
  let storeModel: Model<StoreDocument>;
  let riderModel: Model<RiderDocument>;
  let stripeTransfer: jest.Mock;
  let paystackTransfer: jest.Mock;
  let notify: jest.Mock;
  let listAll: jest.Mock;

  beforeAll(async () => {
    // See backend/CLAUDE.md ("Testing") for why launchTimeout is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    stripeTransfer = jest.fn();
    paystackTransfer = jest.fn();
    notify = jest.fn().mockResolvedValue(undefined);
    listAll = jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Order.name, schema: OrderSchema },
          { name: Payout.name, schema: PayoutSchema },
          { name: Restaurant.name, schema: RestaurantSchema },
          { name: Store.name, schema: StoreSchema },
          { name: Rider.name, schema: RiderSchema },
        ]),
      ],
      providers: [
        PayoutExecutionService,
        PayoutsService,
        { provide: StripeAdapter, useValue: { transfer: stripeTransfer } },
        { provide: PaystackAdapter, useValue: { transfer: paystackTransfer } },
        { provide: FlutterwaveAdapter, useValue: { transfer: jest.fn() } },
        { provide: NotificationsService, useValue: { notify } },
        { provide: UsersService, useValue: { listAll } },
      ],
    }).compile();

    executionService = moduleRef.get(PayoutExecutionService);
    orderModel = moduleRef.get(getModelToken(Order.name));
    payoutModel = moduleRef.get(getModelToken(Payout.name));
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    storeModel = moduleRef.get(getModelToken(Store.name));
    riderModel = moduleRef.get(getModelToken(Rider.name));
  }, 60_000);

  afterEach(async () => {
    await Promise.all([
      orderModel.deleteMany({}).exec(),
      payoutModel.deleteMany({}).exec(),
      restaurantModel.deleteMany({}).exec(),
      storeModel.deleteMany({}).exec(),
      riderModel.deleteMany({}).exec(),
    ]);
    stripeTransfer.mockReset();
    paystackTransfer.mockReset();
    notify.mockClear();
    listAll.mockClear();
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  let counter = 0;

  async function createRestaurant(
    payoutAccounts: unknown[] = [],
    ownerId = `owner-${++counter}`,
  ) {
    counter += 1;
    return restaurantModel.create({
      ownerId,
      name: `Restaurant ${counter}`,
      slug: `restaurant-${counter}`,
      currency: 'NGN',
      country: 'Nigeria',
      address: { line1: '1 St', city: 'Lagos', state: 'Lagos' },
      payoutAccounts,
    });
  }

  // `overrides.restaurantId`/`riderId` must be passed as strings (e.g. `restaurant._id.toString()`),
  // never the raw ObjectId — see backend/CLAUDE.md's Mongoose 9 ObjectId note. Passing the raw
  // ObjectId here once made every query in this file silently match nothing, since this
  // project's `@Prop({ type: Types.ObjectId })` fields don't cast a string query value against
  // an ObjectId-stored one (or vice versa) the way plain Mongoose does — confirmed by comparing
  // against a bare, non-decorator schema. This codebase's own established convention (every
  // service method takes `id: string`, `.toString()`s before writing) already sidesteps this
  // everywhere else; this fixture just has to follow the same discipline.
  async function createDeliveredOrder(overrides: Record<string, unknown>) {
    counter += 1;
    return orderModel.create({
      orderNumber: `ORD-${counter}`,
      customerId: 'customer-id',
      sellerType: 'restaurant',
      items: [
        { name: 'Item', price: 10, qty: 1, selectedModifiers: [], notes: '' },
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
      currency: 'NGN',
      deliveryAddress: { line1: '1 St', city: 'Lagos', state: 'Lagos' },
      vendorPayoutId: null,
      riderPayoutId: null,
      ...overrides,
    });
  }

  it("pays a restaurant's unpaid delivered orders via its active Stripe account and marks the payout succeeded", async () => {
    const restaurant = await createRestaurant([
      { provider: 'stripe', status: 'active', reference: 'acct_123' },
    ]);
    const order = await createDeliveredOrder({
      restaurantId: restaurant._id.toString(),
      paymentProvider: 'stripe',
    });
    stripeTransfer.mockResolvedValue({ transferReference: 'tr_abc' });

    const summary = await executionService.runWeeklyBatch();

    expect(summary).toEqual({
      succeeded: 1,
      failed: 0,
      reconciliationNeeded: 0,
      skipped: 0,
    });
    const payouts = await payoutModel.find({}).exec();
    expect(payouts).toHaveLength(1);
    expect(payouts[0].status).toBe('succeeded');
    expect(payouts[0].providerTransferReference).toBe('tr_abc');
    expect(payouts[0].grossAmount).toBe(85);

    const reloaded = await orderModel.findById(order._id).exec();
    expect(reloaded?.vendorPayoutId).toBe(payouts[0]._id.toString());
  });

  it('releases the claimed orders back to unpaid on a confirmed (clean) transfer rejection, so the next run retries them', async () => {
    const restaurant = await createRestaurant([
      { provider: 'stripe', status: 'active', reference: 'acct_123' },
    ]);
    const order = await createDeliveredOrder({
      restaurantId: restaurant._id.toString(),
      paymentProvider: 'stripe',
    });
    stripeTransfer.mockRejectedValue(new Error('Destination account rejected'));

    const summary = await executionService.runWeeklyBatch();

    expect(summary).toEqual({
      succeeded: 0,
      failed: 1,
      reconciliationNeeded: 0,
      skipped: 0,
    });
    const payouts = await payoutModel.find({}).exec();
    expect(payouts[0].status).toBe('failed');
    expect(payouts[0].reconciliationRequired).toBe(false);

    const reloaded = await orderModel.findById(order._id).exec();
    expect(reloaded?.vendorPayoutId).toBeNull();
  });

  it('does NOT release the claimed orders on an ambiguous (network-layer) failure — flags reconciliationRequired and alerts admins instead of risking a double-pay', async () => {
    listAll.mockResolvedValue({
      items: [{ _id: new Types.ObjectId('507f1f77bcf86cd799439099') }],
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
    });
    const restaurant = await createRestaurant([
      { provider: 'stripe', status: 'active', reference: 'acct_123' },
    ]);
    const order = await createDeliveredOrder({
      restaurantId: restaurant._id.toString(),
      paymentProvider: 'stripe',
    });
    stripeTransfer.mockRejectedValue(
      new TransferOutcomeUnknownError('connection reset mid-request'),
    );

    const summary = await executionService.runWeeklyBatch();

    expect(summary).toEqual({
      succeeded: 0,
      failed: 0,
      reconciliationNeeded: 1,
      skipped: 0,
    });
    const payouts = await payoutModel.find({}).exec();
    expect(payouts[0].status).toBe('failed');
    expect(payouts[0].reconciliationRequired).toBe(true);

    const reloaded = await orderModel.findById(order._id).exec();
    expect(reloaded?.vendorPayoutId).toBe(payouts[0]._id.toString());

    const reconciliationCalls = notify.mock.calls.filter(
      ([input]: [{ type: string }]) =>
        input.type === 'payout_reconciliation_needed',
    );
    expect(reconciliationCalls.length).toBeGreaterThan(0);
  });

  it('skips a vendor whose unpaid earnings are in a currency/provider it has no active payout account for, leaving those orders unpaid rather than forcing them through the wrong account', async () => {
    const restaurant = await createRestaurant([
      { provider: 'stripe', status: 'active', reference: 'acct_123' },
    ]);
    // Paid via paystack — the restaurant only has an active *stripe* account, so this group has
    // nowhere safe to be paid out to yet.
    const order = await createDeliveredOrder({
      restaurantId: restaurant._id.toString(),
      paymentProvider: 'paystack',
    });

    const summary = await executionService.runWeeklyBatch();

    expect(summary).toEqual({
      succeeded: 0,
      failed: 0,
      reconciliationNeeded: 0,
      skipped: 1,
    });
    expect(await payoutModel.countDocuments().exec()).toBe(0);
    const reloaded = await orderModel.findById(order._id).exec();
    expect(reloaded?.vendorPayoutId).toBeNull();
    expect(stripeTransfer).not.toHaveBeenCalled();
    expect(paystackTransfer).not.toHaveBeenCalled();
  });

  it("pays a rider's own delivery-fee earnings independently from the restaurant's cut on the same order", async () => {
    const restaurant = await createRestaurant([
      { provider: 'stripe', status: 'active', reference: 'acct_restaurant' },
    ]);
    const rider = await riderModel.create({
      userId: 'rider-user-1',
      vehicleType: 'motorcycle',
      isVerified: true,
      dateOfBirth: new Date('1995-06-15'),
      governmentIdType: 'national_id',
      governmentIdNumber: 'A1234567',
      governmentIdDocumentUrl: 'https://example.com/id.pdf',
      proofOfAddressDocumentUrl: 'https://example.com/address.pdf',
      guarantor: {
        fullName: 'Jane Guarantor',
        phone: '+2348000000000',
        relationship: 'Sister',
        address: '12 Guarantor Street, Lagos',
      },
      nextOfKinName: 'John Nextofkin',
      nextOfKinPhone: '+2348011111111',
      nextOfKinRelationship: 'Brother',
      payoutAccounts: [
        { provider: 'stripe', status: 'active', reference: 'acct_rider' },
      ],
    });
    const order = await createDeliveredOrder({
      restaurantId: restaurant._id.toString(),
      riderId: rider.userId,
      paymentProvider: 'stripe',
    });
    stripeTransfer.mockResolvedValue({ transferReference: 'tr_shared' });

    const summary = await executionService.runWeeklyBatch();

    expect(summary.succeeded).toBe(2); // one vendor payout, one rider payout
    const payouts = await payoutModel.find({}).sort({ vendorType: 1 }).exec();
    expect(payouts.map((p) => p.vendorType).sort()).toEqual([
      'restaurant',
      'rider',
    ]);
    expect(payouts.find((p) => p.vendorType === 'rider')?.grossAmount).toBe(
      15, // deliveryFee, 100% to the rider
    );
    expect(
      payouts.find((p) => p.vendorType === 'restaurant')?.grossAmount,
    ).toBe(85); // restaurantPayoutAmount, already net of commission

    const reloaded = await orderModel.findById(order._id).exec();
    expect(reloaded?.vendorPayoutId).not.toBeNull();
    expect(reloaded?.riderPayoutId).not.toBeNull();
    expect(reloaded?.vendorPayoutId).not.toBe(reloaded?.riderPayoutId);
  });
});
