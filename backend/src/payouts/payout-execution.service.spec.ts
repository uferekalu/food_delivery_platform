import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { PayoutExecutionService } from './payout-execution.service';
import { PayoutsService } from './payouts.service';
import { Payout, PayoutDocument, PayoutSchema } from './schemas/payout.schema';
import {
  PayoutClawback,
  PayoutClawbackDocument,
  PayoutClawbackSchema,
} from './schemas/payout-clawback.schema';
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
import type { PayoutAccount } from '../common/schemas/payout-account.schema';
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
  let payoutClawbackModel: Model<PayoutClawbackDocument>;
  let restaurantModel: Model<RestaurantDocument>;
  let storeModel: Model<StoreDocument>;
  let riderModel: Model<RiderDocument>;
  let stripeTransfer: jest.Mock;
  let paystackTransfer: jest.Mock;
  let notify: jest.Mock;
  let listAll: jest.Mock;
  let findUserById: jest.Mock;

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
    findUserById = jest.fn().mockResolvedValue(null);

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Order.name, schema: OrderSchema },
          { name: Payout.name, schema: PayoutSchema },
          { name: PayoutClawback.name, schema: PayoutClawbackSchema },
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
        {
          provide: UsersService,
          useValue: { listAll, findById: findUserById },
        },
      ],
    }).compile();

    executionService = moduleRef.get(PayoutExecutionService);
    orderModel = moduleRef.get(getModelToken(Order.name));
    payoutModel = moduleRef.get(getModelToken(Payout.name));
    payoutClawbackModel = moduleRef.get(getModelToken(PayoutClawback.name));
    restaurantModel = moduleRef.get(getModelToken(Restaurant.name));
    storeModel = moduleRef.get(getModelToken(Store.name));
    riderModel = moduleRef.get(getModelToken(Rider.name));
  }, 60_000);

  afterEach(async () => {
    await Promise.all([
      orderModel.deleteMany({}).exec(),
      payoutModel.deleteMany({}).exec(),
      payoutClawbackModel.deleteMany({}).exec(),
      restaurantModel.deleteMany({}).exec(),
      storeModel.deleteMany({}).exec(),
      riderModel.deleteMany({}).exec(),
    ]);
    stripeTransfer.mockReset();
    paystackTransfer.mockReset();
    notify.mockClear();
    listAll.mockClear();
    findUserById.mockClear();
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  let counter = 0;

  async function createRestaurant(
    payoutAccounts: Partial<PayoutAccount>[] = [],
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
      // Real `DELIVERED` orders always have this set (`OrdersService` sets it exactly once, at
      // the DELIVERED transition) — `getUnpaidRiderEarnings` filters on it rather than `status`
      // (docs/ROADMAP.md FDP-109), so a fixture missing it doesn't match what production data
      // actually looks like.
      deliveredAt: new Date(),
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

  it("pays a restaurant's Paystack account via a nuban recipient built from its stored bank details (docs/ROADMAP.md FDP-105 — regression test for the subaccount-transfer bug)", async () => {
    const restaurant = await createRestaurant([
      {
        provider: 'paystack',
        status: 'active',
        reference: 'ACCT_test123',
        bankCode: '044',
        accountNumber: '0123456789',
      },
    ]);
    const order = await createDeliveredOrder({
      restaurantId: restaurant._id.toString(),
      paymentProvider: 'paystack',
    });
    paystackTransfer.mockResolvedValue({ transferReference: 'TRF_abc' });

    const summary = await executionService.runWeeklyBatch();

    expect(summary).toEqual({
      succeeded: 1,
      failed: 0,
      reconciliationNeeded: 0,
      skipped: 0,
    });
    expect(paystackTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ bankCode: '044', accountNumber: '0123456789' }),
    );
    const reloaded = await orderModel.findById(order._id).exec();
    expect(reloaded?.vendorPayoutId).not.toBeNull();
  });

  it('fails cleanly (confirmed rejection, retried next run) when a Paystack account is active but missing the bank details a transfer needs', async () => {
    const restaurant = await createRestaurant([
      { provider: 'paystack', status: 'active', reference: 'ACCT_test123' },
      // bankCode/accountNumber deliberately omitted — an account onboarded before FDP-92 added
      // this persistence, or a data-entry gap.
    ]);
    const order = await createDeliveredOrder({
      restaurantId: restaurant._id.toString(),
      paymentProvider: 'paystack',
    });

    const summary = await executionService.runWeeklyBatch();

    expect(summary).toEqual({
      succeeded: 0,
      failed: 1,
      reconciliationNeeded: 0,
      skipped: 0,
    });
    expect(paystackTransfer).not.toHaveBeenCalled();
    const payouts = await payoutModel.find({}).exec();
    expect(payouts[0].failureReason).toContain('missing bank details');
    const reloaded = await orderModel.findById(order._id).exec();
    expect(reloaded?.vendorPayoutId).toBeNull(); // released for retry
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

  describe('dashboards (docs/ROADMAP.md FDP-93)', () => {
    it('listForVendor returns only that vendor’s own payouts, most recent first', async () => {
      const older = await payoutModel.create({
        vendorType: 'restaurant',
        vendorId: 'restaurant-1',
        orderIds: [] as Types.ObjectId[],
        grossAmount: 50,
        currency: 'NGN',
        provider: 'stripe',
        payoutAccountReference: 'acct_1',
        status: 'succeeded',
      });
      // `timestamps: true` manages `createdAt` automatically and Mongoose's typed `.create()`
      // input intentionally excludes it — backdating it for this ordering test has to go through
      // a raw update instead.
      await payoutModel
        .updateOne({ _id: older._id }, { createdAt: new Date('2026-01-01') })
        .exec();
      const newer = await payoutModel.create({
        vendorType: 'restaurant',
        vendorId: 'restaurant-1',
        orderIds: [] as Types.ObjectId[],
        grossAmount: 75,
        currency: 'NGN',
        provider: 'stripe',
        payoutAccountReference: 'acct_1',
        status: 'succeeded',
      });
      await payoutModel
        .updateOne({ _id: newer._id }, { createdAt: new Date('2026-02-01') })
        .exec();
      await payoutModel.create({
        vendorType: 'restaurant',
        vendorId: 'restaurant-2', // a different vendor — must never show up
        orderIds: [] as Types.ObjectId[],
        grossAmount: 999,
        currency: 'NGN',
        provider: 'stripe',
        payoutAccountReference: 'acct_2',
        status: 'succeeded',
      });

      const result = await executionService.listForVendor(
        'restaurant',
        'restaurant-1',
        1,
        20,
      );

      expect(result.total).toBe(2);
      expect(result.items.map((p) => p._id.toString())).toEqual([
        newer._id.toString(),
        older._id.toString(),
      ]);
    });

    it('listAll resolves each payout to its real vendor display name, not just a raw id (docs/ROADMAP.md FDP-105)', async () => {
      const restaurant = await createRestaurant([], 'restaurant-owner-1');
      const store = await storeModel.create({
        ownerId: 'store-owner-1',
        name: 'Preen Mart',
        slug: 'preen-mart',
        type: 'groceries',
        currency: 'NGN',
        country: 'Nigeria',
        address: { line1: '1 St', city: 'Lagos', state: 'Lagos' },
        payoutAccounts: [],
      });
      await payoutModel.create({
        vendorType: 'restaurant',
        vendorId: restaurant._id.toString(),
        orderIds: [] as Types.ObjectId[],
        grossAmount: 50,
        currency: 'NGN',
        provider: 'stripe',
        payoutAccountReference: 'acct_1',
        status: 'succeeded',
      });
      await payoutModel.create({
        vendorType: 'store',
        vendorId: store._id.toString(),
        orderIds: [] as Types.ObjectId[],
        grossAmount: 30,
        currency: 'NGN',
        provider: 'paystack',
        payoutAccountReference: 'acct_2',
        status: 'succeeded',
      });
      // A vendor id that no longer resolves to any document — must show null, not throw.
      await payoutModel.create({
        vendorType: 'store',
        vendorId: '507f1f77bcf86cd799439099',
        orderIds: [] as Types.ObjectId[],
        grossAmount: 10,
        currency: 'NGN',
        provider: 'paystack',
        payoutAccountReference: 'acct_3',
        status: 'succeeded',
      });

      const result = await executionService.listAll({ page: 1, limit: 20 });

      const byVendorId = new Map(
        result.items.map((item) => [item.vendorId, item.vendorName]),
      );
      // `createRestaurant`'s auto-generated name (`Restaurant ${counter}`) isn't a fixed literal
      // since `counter` is shared across every test in this file — compare against the fixture's
      // own `.name` rather than a hardcoded string.
      expect(byVendorId.get(restaurant._id.toString())).toBe(restaurant.name);
      expect(byVendorId.get(store._id.toString())).toBe('Preen Mart');
      expect(byVendorId.get('507f1f77bcf86cd799439099')).toBeNull();
    });

    it('listAll applies status/vendorType/reconciliationRequired filters together', async () => {
      await payoutModel.create({
        vendorType: 'restaurant',
        vendorId: 'restaurant-1',
        orderIds: [] as Types.ObjectId[],
        grossAmount: 50,
        currency: 'NGN',
        provider: 'stripe',
        payoutAccountReference: 'acct_1',
        status: 'failed',
        reconciliationRequired: true,
      });
      await payoutModel.create({
        vendorType: 'rider',
        vendorId: 'rider-1',
        orderIds: [] as Types.ObjectId[],
        grossAmount: 15,
        currency: 'NGN',
        provider: 'stripe',
        payoutAccountReference: 'acct_2',
        status: 'failed',
        reconciliationRequired: true,
      });
      await payoutModel.create({
        vendorType: 'restaurant',
        vendorId: 'restaurant-2',
        orderIds: [] as Types.ObjectId[],
        grossAmount: 30,
        currency: 'NGN',
        provider: 'stripe',
        payoutAccountReference: 'acct_3',
        status: 'succeeded',
        reconciliationRequired: false,
      });

      const result = await executionService.listAll({
        page: 1,
        limit: 20,
        status: 'failed',
        vendorType: 'restaurant',
        reconciliationRequired: true,
      });

      expect(result.total).toBe(1);
      expect(result.items[0].vendorId).toBe('restaurant-1');
    });

    it('resolveReconciliation(true) marks the payout succeeded without releasing its claimed orders', async () => {
      const order = await createDeliveredOrder({
        restaurantId: 'restaurant-1',
        vendorPayoutId: 'placeholder',
      });
      const payout = await payoutModel.create({
        vendorType: 'restaurant',
        vendorId: 'restaurant-1',
        orderIds: [order._id],
        grossAmount: 85,
        currency: 'NGN',
        provider: 'stripe',
        payoutAccountReference: 'acct_1',
        status: 'failed',
        reconciliationRequired: true,
      });
      await orderModel
        .updateOne(
          { _id: order._id },
          { vendorPayoutId: payout._id.toString() },
        )
        .exec();

      const resolved = await executionService.resolveReconciliation(
        payout._id.toString(),
        'admin-1',
        true,
      );

      expect(resolved.status).toBe('succeeded');
      expect(resolved.reconciliationRequired).toBe(false);
      expect(resolved.reconciledBy).toBe('admin-1');
      const reloadedOrder = await orderModel.findById(order._id).exec();
      expect(reloadedOrder?.vendorPayoutId).toBe(payout._id.toString());
    });

    it('resolveReconciliation(true) applies the payout’s snapshotted clawback consumption (docs/ROADMAP.md FDP-109)', async () => {
      const order = await createDeliveredOrder({
        restaurantId: 'restaurant-1',
        vendorPayoutId: 'placeholder',
      });
      const clawback = await payoutClawbackModel.create({
        vendorType: 'restaurant',
        vendorId: 'restaurant-1',
        orderId: 'refunded-order-id',
        originalPayoutId: 'previous-payout-id',
        provider: 'stripe',
        currency: 'NGN',
        amount: 30,
        remainingAmount: 30,
        status: 'pending',
      });
      const payout = await payoutModel.create({
        vendorType: 'restaurant',
        vendorId: 'restaurant-1',
        orderIds: [order._id],
        grossAmount: 55,
        clawbackDeducted: 30,
        clawbackConsumption: [
          { clawbackId: clawback._id.toString(), amountConsumed: 30 },
        ],
        currency: 'NGN',
        provider: 'stripe',
        payoutAccountReference: 'acct_1',
        status: 'failed',
        reconciliationRequired: true,
      });
      await orderModel
        .updateOne(
          { _id: order._id },
          { vendorPayoutId: payout._id.toString() },
        )
        .exec();

      await executionService.resolveReconciliation(
        payout._id.toString(),
        'admin-1',
        true,
      );

      const reloadedClawback = await payoutClawbackModel
        .findById(clawback._id)
        .exec();
      expect(reloadedClawback?.remainingAmount).toBe(0);
      expect(reloadedClawback?.status).toBe('fully_applied');
    });

    it('resolveReconciliation(false) does not touch the clawback — nothing was actually recovered', async () => {
      const order = await createDeliveredOrder({
        restaurantId: 'restaurant-1',
      });
      const clawback = await payoutClawbackModel.create({
        vendorType: 'restaurant',
        vendorId: 'restaurant-1',
        orderId: 'refunded-order-id',
        originalPayoutId: 'previous-payout-id',
        provider: 'stripe',
        currency: 'NGN',
        amount: 30,
        remainingAmount: 30,
        status: 'pending',
      });
      const payout = await payoutModel.create({
        vendorType: 'restaurant',
        vendorId: 'restaurant-1',
        orderIds: [order._id],
        grossAmount: 55,
        clawbackDeducted: 30,
        clawbackConsumption: [
          { clawbackId: clawback._id.toString(), amountConsumed: 30 },
        ],
        currency: 'NGN',
        provider: 'stripe',
        payoutAccountReference: 'acct_1',
        status: 'failed',
        reconciliationRequired: true,
      });
      await orderModel
        .updateOne(
          { _id: order._id },
          { vendorPayoutId: payout._id.toString() },
        )
        .exec();

      await executionService.resolveReconciliation(
        payout._id.toString(),
        'admin-1',
        false,
      );

      const reloadedClawback = await payoutClawbackModel
        .findById(clawback._id)
        .exec();
      expect(reloadedClawback?.remainingAmount).toBe(30);
      expect(reloadedClawback?.status).toBe('pending');
    });

    it('resolveReconciliation(false) marks the payout failed and releases its claimed orders back to the unpaid pool', async () => {
      const order = await createDeliveredOrder({
        restaurantId: 'restaurant-1',
      });
      const payout = await payoutModel.create({
        vendorType: 'restaurant',
        vendorId: 'restaurant-1',
        orderIds: [order._id],
        grossAmount: 85,
        currency: 'NGN',
        provider: 'stripe',
        payoutAccountReference: 'acct_1',
        status: 'failed',
        reconciliationRequired: true,
      });
      await orderModel
        .updateOne(
          { _id: order._id },
          { vendorPayoutId: payout._id.toString() },
        )
        .exec();

      const resolved = await executionService.resolveReconciliation(
        payout._id.toString(),
        'admin-1',
        false,
      );

      expect(resolved.status).toBe('failed');
      expect(resolved.reconciliationRequired).toBe(false);
      const reloadedOrder = await orderModel.findById(order._id).exec();
      expect(reloadedOrder?.vendorPayoutId).toBeNull();
    });

    it('rejects resolving a payout that was never flagged for reconciliation', async () => {
      const payout = await payoutModel.create({
        vendorType: 'restaurant',
        vendorId: 'restaurant-1',
        orderIds: [] as Types.ObjectId[],
        grossAmount: 85,
        currency: 'NGN',
        provider: 'stripe',
        payoutAccountReference: 'acct_1',
        status: 'succeeded',
        reconciliationRequired: false,
      });

      await expect(
        executionService.resolveReconciliation(
          payout._id.toString(),
          'admin-1',
          true,
        ),
      ).rejects.toThrow('This payout is not flagged for reconciliation');
    });
  });

  describe('refund clawback (docs/ROADMAP.md FDP-104)', () => {
    it('deducts a pending clawback from a vendor payout and marks it fully_applied once fully consumed', async () => {
      const restaurant = await createRestaurant([
        { provider: 'stripe', status: 'active', reference: 'acct_123' },
      ]);
      await createDeliveredOrder({
        restaurantId: restaurant._id.toString(),
        paymentProvider: 'stripe',
      });
      const clawback = await payoutClawbackModel.create({
        vendorType: 'restaurant',
        vendorId: restaurant._id.toString(),
        orderId: 'refunded-order-id',
        originalPayoutId: 'previous-payout-id',
        provider: 'stripe',
        currency: 'NGN',
        amount: 30,
        remainingAmount: 30,
        status: 'pending',
      });
      stripeTransfer.mockResolvedValue({ transferReference: 'tr_net' });

      const summary = await executionService.runWeeklyBatch();

      expect(summary).toEqual({
        succeeded: 1,
        failed: 0,
        reconciliationNeeded: 0,
        skipped: 0,
      });
      const payouts = await payoutModel.find({}).exec();
      expect(payouts[0].grossAmount).toBe(55); // 85 raw - 30 clawback
      expect(payouts[0].clawbackDeducted).toBe(30);
      expect(stripeTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 55 }),
      );

      const reloadedClawback = await payoutClawbackModel
        .findById(clawback._id)
        .exec();
      expect(reloadedClawback?.remainingAmount).toBe(0);
      expect(reloadedClawback?.status).toBe('fully_applied');
    });

    it('carries an unconsumed clawback remainder forward when it exceeds this run’s raw earnings', async () => {
      const restaurant = await createRestaurant([
        { provider: 'stripe', status: 'active', reference: 'acct_123' },
      ]);
      await createDeliveredOrder({
        restaurantId: restaurant._id.toString(),
        paymentProvider: 'stripe',
      });
      const clawback = await payoutClawbackModel.create({
        vendorType: 'restaurant',
        vendorId: restaurant._id.toString(),
        orderId: 'refunded-order-id',
        originalPayoutId: 'previous-payout-id',
        provider: 'stripe',
        currency: 'NGN',
        amount: 200,
        remainingAmount: 200,
        status: 'pending',
      });
      stripeTransfer.mockResolvedValue({ transferReference: 'tr_zero' });

      const summary = await executionService.runWeeklyBatch();

      expect(summary.succeeded).toBe(1);
      const payouts = await payoutModel.find({}).exec();
      expect(payouts[0].grossAmount).toBe(0);
      expect(payouts[0].clawbackDeducted).toBe(85);
      expect(payouts[0].providerTransferReference).toBeNull();
      // No actual money-moving call for a $0 payout — everything this week went to the clawback.
      expect(stripeTransfer).not.toHaveBeenCalled();

      const reloadedClawback = await payoutClawbackModel
        .findById(clawback._id)
        .exec();
      expect(reloadedClawback?.remainingAmount).toBe(115); // 200 - 85
      expect(reloadedClawback?.status).toBe('pending');
    });

    it('does NOT decrement a clawback when the payout attempt fails (nothing was actually recovered)', async () => {
      const restaurant = await createRestaurant([
        { provider: 'stripe', status: 'active', reference: 'acct_123' },
      ]);
      await createDeliveredOrder({
        restaurantId: restaurant._id.toString(),
        paymentProvider: 'stripe',
      });
      const clawback = await payoutClawbackModel.create({
        vendorType: 'restaurant',
        vendorId: restaurant._id.toString(),
        orderId: 'refunded-order-id',
        originalPayoutId: 'previous-payout-id',
        provider: 'stripe',
        currency: 'NGN',
        amount: 30,
        remainingAmount: 30,
        status: 'pending',
      });
      stripeTransfer.mockRejectedValue(
        new Error('Destination account rejected'),
      );

      await executionService.runWeeklyBatch();

      const reloadedClawback = await payoutClawbackModel
        .findById(clawback._id)
        .exec();
      expect(reloadedClawback?.remainingAmount).toBe(30);
      expect(reloadedClawback?.status).toBe('pending');
    });
  });

  describe('idempotency (docs/ROADMAP.md FDP-104)', () => {
    it('is safe to run twice in a row — the second run pays nothing new', async () => {
      const restaurant = await createRestaurant([
        { provider: 'stripe', status: 'active', reference: 'acct_123' },
      ]);
      await createDeliveredOrder({
        restaurantId: restaurant._id.toString(),
        paymentProvider: 'stripe',
      });
      stripeTransfer.mockResolvedValue({ transferReference: 'tr_once' });

      const first = await executionService.runWeeklyBatch();
      expect(first).toEqual({
        succeeded: 1,
        failed: 0,
        reconciliationNeeded: 0,
        skipped: 0,
      });

      const second = await executionService.runWeeklyBatch();
      expect(second).toEqual({
        succeeded: 0,
        failed: 0,
        reconciliationNeeded: 0,
        skipped: 0,
      });
      expect(await payoutModel.countDocuments().exec()).toBe(1);
      expect(stripeTransfer).toHaveBeenCalledTimes(1);
    });
  });
});
