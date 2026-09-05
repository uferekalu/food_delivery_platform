import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { OrdersService } from '../orders/orders.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentProviderResolver } from './provider-resolver';
import { StripeAdapter } from './adapters/stripe.adapter';
import { PaystackAdapter } from './adapters/paystack.adapter';
import { FlutterwaveAdapter } from './adapters/flutterwave.adapter';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let ordersService: jest.Mocked<
    Pick<
      OrdersService,
      | 'findOne'
      | 'setPaymentRef'
      | 'findByPaymentRef'
      | 'markPaidFromWebhook'
      | 'markPaymentFailed'
      | 'adminFindOrThrow'
      | 'claimForRefund'
      | 'finalizeRefund'
      | 'revertFailedRefundClaim'
    >
  >;
  let restaurantsService: jest.Mocked<
    Pick<
      RestaurantsService,
      | 'findByIdOrThrow'
      | 'findByPayoutAccountReference'
      | 'setPayoutAccountFromWebhook'
    >
  >;
  let notificationsService: jest.Mocked<Pick<NotificationsService, 'notify'>>;
  let providerResolver: jest.Mocked<Pick<PaymentProviderResolver, 'resolve'>>;
  let stripeAdapter: {
    initiate: jest.Mock;
    verify: jest.Mock;
    handleWebhook: jest.Mock;
    refund: jest.Mock;
    parseAccountWebhookEvent: jest.Mock;
  };
  let paystackAdapter: {
    initiate: jest.Mock;
    verify: jest.Mock;
    handleWebhook: jest.Mock;
    refund: jest.Mock;
  };

  const user = {
    sub: 'customer-1',
    email: 'jane@example.com',
    role: 'customer',
  } as const;

  beforeEach(async () => {
    ordersService = {
      findOne: jest.fn(),
      setPaymentRef: jest.fn(),
      findByPaymentRef: jest.fn(),
      markPaidFromWebhook: jest.fn(),
      markPaymentFailed: jest.fn(),
      adminFindOrThrow: jest.fn(),
      claimForRefund: jest.fn(),
      finalizeRefund: jest.fn(),
      revertFailedRefundClaim: jest.fn(),
    };
    restaurantsService = {
      findByIdOrThrow: jest.fn(),
      findByPayoutAccountReference: jest.fn(),
      setPayoutAccountFromWebhook: jest.fn(),
    };
    // Default: no active payout account for any provider — the pre-FDP-52 behavior every
    // existing initiatePayment test below exercises. Tests that need an active account
    // override this per-case.
    restaurantsService.findByIdOrThrow.mockResolvedValue({
      payoutAccounts: [],
    } as never);
    notificationsService = { notify: jest.fn().mockResolvedValue(undefined) };
    providerResolver = { resolve: jest.fn() };
    stripeAdapter = {
      initiate: jest.fn(),
      verify: jest.fn(),
      handleWebhook: jest.fn(),
      refund: jest.fn(),
      parseAccountWebhookEvent: jest.fn(),
    };
    paystackAdapter = {
      initiate: jest.fn(),
      verify: jest.fn(),
      handleWebhook: jest.fn(),
      refund: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: OrdersService, useValue: ordersService },
        { provide: RestaurantsService, useValue: restaurantsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: PaymentProviderResolver, useValue: providerResolver },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'http://localhost:3000' },
        },
        { provide: StripeAdapter, useValue: stripeAdapter },
        { provide: PaystackAdapter, useValue: paystackAdapter },
        {
          provide: FlutterwaveAdapter,
          useValue: {
            initiate: jest.fn(),
            verify: jest.fn(),
            handleWebhook: jest.fn(),
            refund: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
  });

  describe('initiatePayment', () => {
    it('rejects an order that is not PENDING_PAYMENT', async () => {
      ordersService.findOne.mockResolvedValue({
        status: 'PLACED',
      } as never);

      await expect(service.initiatePayment(user, 'order-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it("initiates against the order's default provider and records the payment ref", async () => {
      const order = {
        _id: { toString: () => 'order-1' },
        restaurantId: { toString: () => 'restaurant-1' },
        status: 'PENDING_PAYMENT',
        paymentProvider: 'stripe',
        orderNumber: 'ORD-1',
        total: 25,
        currency: 'USD',
      };
      ordersService.findOne.mockResolvedValue(order as never);
      stripeAdapter.initiate.mockResolvedValue({
        redirectUrl: 'https://checkout.stripe.com/session/abc',
        reference: 'cs_test_abc',
      });

      const result = await service.initiatePayment(user, 'order-1');

      expect(result.redirectUrl).toBe(
        'https://checkout.stripe.com/session/abc',
      );
      expect(stripeAdapter.initiate).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-1',
          orderNumber: 'ORD-1',
          amount: 25,
          currency: 'USD',
          customerEmail: 'jane@example.com',
        }),
      );
      expect(ordersService.setPaymentRef).toHaveBeenCalledWith(
        order,
        'stripe',
        'cs_test_abc',
        false, // no active payout account -> no instant split applied (docs/ROADMAP.md FDP-92)
      );
    });

    it('rejects a provider override the currency does not support', async () => {
      ordersService.findOne.mockResolvedValue({
        _id: { toString: () => 'order-1' },
        restaurantId: { toString: () => 'restaurant-1' },
        status: 'PENDING_PAYMENT',
        paymentProvider: 'paystack',
        currency: 'NGN',
      } as never);
      providerResolver.resolve.mockReturnValue(['paystack', 'flutterwave']);

      await expect(
        service.initiatePayment(user, 'order-1', 'stripe'),
      ).rejects.toThrow(BadRequestException);
    });

    it('honors a valid provider override', async () => {
      const order = {
        _id: { toString: () => 'order-1' },
        restaurantId: { toString: () => 'restaurant-1' },
        status: 'PENDING_PAYMENT',
        paymentProvider: 'paystack',
        orderNumber: 'ORD-1',
        total: 5000,
        currency: 'NGN',
      };
      ordersService.findOne.mockResolvedValue(order as never);
      providerResolver.resolve.mockReturnValue(['paystack', 'flutterwave']);
      paystackAdapter.initiate.mockResolvedValue({
        redirectUrl: 'https://checkout.paystack.com/abc',
        reference: 'ORD-1-abcd',
      });

      await service.initiatePayment(user, 'order-1', 'paystack');

      expect(paystackAdapter.initiate).toHaveBeenCalled();
      expect(ordersService.setPaymentRef).toHaveBeenCalledWith(
        order,
        'paystack',
        'ORD-1-abcd',
        false,
      );
    });

    it("passes the restaurant's active payout account reference and payout amount through to the adapter (FDP-52)", async () => {
      const order = {
        _id: { toString: () => 'order-1' },
        restaurantId: { toString: () => 'restaurant-1' },
        status: 'PENDING_PAYMENT',
        paymentProvider: 'paystack',
        orderNumber: 'ORD-1',
        total: 115,
        restaurantPayoutAmount: 85,
        currency: 'NGN',
      };
      ordersService.findOne.mockResolvedValue(order as never);
      restaurantsService.findByIdOrThrow.mockResolvedValue({
        payoutAccounts: [
          { provider: 'paystack', status: 'active', reference: 'ACCT_test123' },
          { provider: 'stripe', status: 'pending', reference: null },
        ],
      } as never);
      paystackAdapter.initiate.mockResolvedValue({
        redirectUrl: 'https://checkout.paystack.com/abc',
        reference: 'ORD-1-abcd',
      });

      await service.initiatePayment(user, 'order-1');

      expect(paystackAdapter.initiate).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurantPayoutAccountReference: 'ACCT_test123',
          restaurantPayoutAmount: 85,
        }),
      );
      // docs/ROADMAP.md FDP-92 — the split was actually applied, so the weekly batch must never
      // pay this order's vendor cut out again.
      expect(ordersService.setPaymentRef).toHaveBeenCalledWith(
        order,
        'paystack',
        'ORD-1-abcd',
        true,
      );
    });

    it("clamps the split amount sent to the adapter to the order's total (docs/ROADMAP.md FDP-65) — a big enough promo discount can otherwise push total below restaurantPayoutAmount, asking a live provider for an invalid split", async () => {
      const order = {
        _id: { toString: () => 'order-1' },
        restaurantId: { toString: () => 'restaurant-1' },
        status: 'PENDING_PAYMENT',
        paymentProvider: 'paystack',
        orderNumber: 'ORD-1',
        total: 58, // subtotal 100, deliveryFee 3, serviceFee 5, a 50-off promo
        restaurantPayoutAmount: 85, // 100 subtotal - 15 platform commission
        currency: 'NGN',
      };
      ordersService.findOne.mockResolvedValue(order as never);
      restaurantsService.findByIdOrThrow.mockResolvedValue({
        payoutAccounts: [
          { provider: 'paystack', status: 'active', reference: 'ACCT_test123' },
        ],
      } as never);
      paystackAdapter.initiate.mockResolvedValue({
        redirectUrl: 'https://checkout.paystack.com/abc',
        reference: 'ORD-1-abcd',
      });

      await service.initiatePayment(user, 'order-1');

      expect(paystackAdapter.initiate).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurantPayoutAmount: 58, // clamped to total, never exceeds what's actually charged
        }),
      );
    });

    it('omits the payout account reference when the restaurant has none active for the charging provider', async () => {
      const order = {
        _id: { toString: () => 'order-1' },
        restaurantId: { toString: () => 'restaurant-1' },
        status: 'PENDING_PAYMENT',
        paymentProvider: 'paystack',
        orderNumber: 'ORD-1',
        total: 115,
        restaurantPayoutAmount: 85,
        currency: 'NGN',
      };
      ordersService.findOne.mockResolvedValue(order as never);
      restaurantsService.findByIdOrThrow.mockResolvedValue({
        payoutAccounts: [
          { provider: 'stripe', status: 'active', reference: 'acct_stripe' },
        ],
      } as never);
      paystackAdapter.initiate.mockResolvedValue({
        redirectUrl: 'https://checkout.paystack.com/abc',
        reference: 'ORD-1-abcd',
      });

      await service.initiatePayment(user, 'order-1');

      expect(paystackAdapter.initiate).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurantPayoutAccountReference: undefined,
        }),
      );
    });

    it("wraps a raw adapter error (e.g. the provider's own API rejection) as a BadRequestException instead of letting it surface as a 500", async () => {
      // Found via live testing against the real Stripe API (FDP-14): a tiny order total
      // triggers Stripe's ~$0.50 minimum-charge rejection, which previously bubbled up as an
      // opaque "Internal server error".
      const order = {
        _id: { toString: () => 'order-1' },
        restaurantId: { toString: () => 'restaurant-1' },
        status: 'PENDING_PAYMENT',
        paymentProvider: 'stripe',
        orderNumber: 'ORD-1',
        total: 0.01,
        currency: 'USD',
      };
      ordersService.findOne.mockResolvedValue(order as never);
      stripeAdapter.initiate.mockRejectedValue(
        new Error(
          "The Checkout Session's total amount must convert to at least 50 cents.",
        ),
      );

      await expect(service.initiatePayment(user, 'order-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(ordersService.setPaymentRef).not.toHaveBeenCalled();
    });
  });

  describe('verifyPayment', () => {
    it('returns the order unchanged if it is no longer PENDING_PAYMENT', async () => {
      const order = { status: 'PLACED' };
      ordersService.findOne.mockResolvedValue(order as never);

      const result = await service.verifyPayment(user.sub, 'order-1');

      expect(result).toBe(order);
      expect(stripeAdapter.verify).not.toHaveBeenCalled();
    });

    it('rejects an order with no payment attempt to verify yet', async () => {
      ordersService.findOne.mockResolvedValue({
        status: 'PENDING_PAYMENT',
        paymentRef: null,
      } as never);

      await expect(service.verifyPayment(user.sub, 'order-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it("marks the order paid when the provider confirms success — the fix for orders stuck on 'Confirming your payment…' when a webhook never arrives", async () => {
      ordersService.findOne.mockResolvedValue({
        _id: { toString: () => 'order-1' },
        status: 'PENDING_PAYMENT',
        paymentProvider: 'paystack',
        paymentRef: 'ORD-1-abcd',
      } as never);
      paystackAdapter.verify.mockResolvedValue({
        success: true,
        reference: 'ORD-1-abcd',
      });
      ordersService.markPaidFromWebhook.mockResolvedValue({
        status: 'PLACED',
      } as never);

      const result = await service.verifyPayment(user.sub, 'order-1');

      expect(paystackAdapter.verify).toHaveBeenCalledWith('ORD-1-abcd');
      expect(ordersService.markPaidFromWebhook).toHaveBeenCalledWith('order-1');
      expect(ordersService.markPaymentFailed).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'PLACED' });
    });

    it('marks the order failed when the provider reports no success', async () => {
      const order = {
        _id: { toString: () => 'order-1' },
        status: 'PENDING_PAYMENT',
        paymentProvider: 'stripe',
        paymentRef: 'cs_test_abc',
      };
      ordersService.findOne.mockResolvedValue(order as never);
      stripeAdapter.verify.mockResolvedValue({
        success: false,
        reference: 'cs_test_abc',
      });
      ordersService.markPaymentFailed.mockResolvedValue({
        paymentStatus: 'failed',
      } as never);

      const result = await service.verifyPayment(user.sub, 'order-1');

      expect(ordersService.markPaymentFailed).toHaveBeenCalledWith('order-1');
      expect(ordersService.markPaidFromWebhook).not.toHaveBeenCalled();
      expect(result).toEqual({ paymentStatus: 'failed' });
    });

    it('leaves the order in PENDING_PAYMENT when the provider check itself errors, rather than marking it failed', async () => {
      const order = {
        _id: { toString: () => 'order-1' },
        status: 'PENDING_PAYMENT',
        paymentProvider: 'stripe',
        paymentRef: 'cs_test_abc',
      };
      ordersService.findOne.mockResolvedValue(order as never);
      stripeAdapter.verify.mockRejectedValue(new Error('Stripe API down'));

      const result = await service.verifyPayment(user.sub, 'order-1');

      expect(result).toBe(order);
      expect(ordersService.markPaymentFailed).not.toHaveBeenCalled();
      expect(ordersService.markPaidFromWebhook).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook', () => {
    it('does nothing for an unverifiable event', async () => {
      stripeAdapter.handleWebhook.mockResolvedValue(null);

      await service.handleWebhook('stripe', Buffer.from('{}'), 'bad-sig');

      expect(ordersService.findByPaymentRef).not.toHaveBeenCalled();
    });

    it('does nothing when the reference matches no order', async () => {
      stripeAdapter.handleWebhook.mockResolvedValue({
        reference: 'cs_test_unknown',
        success: true,
      });
      ordersService.findByPaymentRef.mockResolvedValue(null);

      await service.handleWebhook('stripe', Buffer.from('{}'), 'sig');

      expect(ordersService.markPaidFromWebhook).not.toHaveBeenCalled();
    });

    it('marks the order paid on a successful event', async () => {
      stripeAdapter.handleWebhook.mockResolvedValue({
        reference: 'cs_test_abc',
        success: true,
      });
      ordersService.findByPaymentRef.mockResolvedValue({
        _id: { toString: () => 'order-1' },
        paymentProvider: 'stripe',
      } as never);

      await service.handleWebhook('stripe', Buffer.from('{}'), 'sig');

      expect(ordersService.markPaidFromWebhook).toHaveBeenCalledWith('order-1');
      expect(ordersService.markPaymentFailed).not.toHaveBeenCalled();
    });

    it('marks the order failed on a failed event', async () => {
      stripeAdapter.handleWebhook.mockResolvedValue({
        reference: 'cs_test_abc',
        success: false,
      });
      ordersService.findByPaymentRef.mockResolvedValue({
        _id: { toString: () => 'order-1' },
        paymentProvider: 'stripe',
      } as never);

      await service.handleWebhook('stripe', Buffer.from('{}'), 'sig');

      expect(ordersService.markPaymentFailed).toHaveBeenCalledWith('order-1');
      expect(ordersService.markPaidFromWebhook).not.toHaveBeenCalled();
    });

    it("ignores a correctly-signed webhook whose reference belongs to a *different* provider's order (docs/ROADMAP.md FDP-65) — a real provider only ever fires events for its own references", async () => {
      // A stripe-signed event claims a reference that actually belongs to a paystack order.
      stripeAdapter.handleWebhook.mockResolvedValue({
        reference: 'shared-ref',
        success: true,
      });
      ordersService.findByPaymentRef.mockResolvedValue({
        _id: { toString: () => 'order-1' },
        paymentProvider: 'paystack',
      } as never);

      await service.handleWebhook('stripe', Buffer.from('{}'), 'sig');

      expect(ordersService.markPaidFromWebhook).not.toHaveBeenCalled();
      expect(ordersService.markPaymentFailed).not.toHaveBeenCalled();
    });

    it('never lets an adapter throwing (e.g. a malformed webhook body) surface past this method as an uncaught error', async () => {
      stripeAdapter.handleWebhook.mockRejectedValue(
        new TypeError("Cannot read properties of undefined (reading 'tx_ref')"),
      );

      await expect(
        service.handleWebhook('stripe', Buffer.from('not json'), 'sig'),
      ).resolves.toBeUndefined();
      expect(ordersService.findByPaymentRef).not.toHaveBeenCalled();
    });
  });

  describe('refundOrder', () => {
    it("refunds via the order's provider adapter and finalizes the refund", async () => {
      const order = {
        _id: { toString: () => 'order-1' },
        status: 'DELIVERED',
        paymentStatus: 'succeeded',
        paymentProvider: 'stripe',
        paymentRef: 'cs_test_abc',
      };
      ordersService.adminFindOrThrow.mockResolvedValue(order as never);
      ordersService.claimForRefund.mockResolvedValue({
        status: 'DELIVERED',
      } as never);
      stripeAdapter.refund.mockResolvedValue(undefined);
      ordersService.finalizeRefund.mockResolvedValue({
        status: 'REFUNDED',
      } as never);

      const result = await service.refundOrder('order-1');

      expect(ordersService.claimForRefund).toHaveBeenCalledWith('order-1');
      expect(stripeAdapter.refund).toHaveBeenCalledWith('cs_test_abc');
      expect(ordersService.finalizeRefund).toHaveBeenCalledWith('order-1');
      expect(ordersService.revertFailedRefundClaim).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'REFUNDED' });
    });

    it("allows refunding a CANCELLED order with a succeeded payment (docs/ROADMAP.md FDP-65) — previously the only refundable status was DELIVERED, so a paid-then-cancelled order's charge could never be reversed", async () => {
      const order = {
        _id: { toString: () => 'order-1' },
        status: 'CANCELLED',
        paymentStatus: 'succeeded',
        paymentProvider: 'stripe',
        paymentRef: 'cs_test_abc',
      };
      ordersService.adminFindOrThrow.mockResolvedValue(order as never);
      ordersService.claimForRefund.mockResolvedValue({
        status: 'CANCELLED',
      } as never);
      stripeAdapter.refund.mockResolvedValue(undefined);
      ordersService.finalizeRefund.mockResolvedValue({
        status: 'REFUNDED',
      } as never);

      const result = await service.refundOrder('order-1');

      expect(stripeAdapter.refund).toHaveBeenCalledWith('cs_test_abc');
      expect(result).toEqual({ status: 'REFUNDED' });
    });

    it('rejects a refund for an order that is neither DELIVERED nor CANCELLED', async () => {
      ordersService.adminFindOrThrow.mockResolvedValue({
        status: 'PREPARING',
        paymentStatus: 'succeeded',
        paymentProvider: 'stripe',
        paymentRef: 'cs_test_abc',
      } as never);

      await expect(service.refundOrder('order-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(ordersService.claimForRefund).not.toHaveBeenCalled();
      expect(stripeAdapter.refund).not.toHaveBeenCalled();
    });

    it('rejects a refund for an order whose payment never succeeded', async () => {
      ordersService.adminFindOrThrow.mockResolvedValue({
        status: 'DELIVERED',
        paymentStatus: 'failed',
        paymentProvider: 'stripe',
        paymentRef: 'cs_test_abc',
      } as never);

      await expect(service.refundOrder('order-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(stripeAdapter.refund).not.toHaveBeenCalled();
    });

    it("rejects when the order can't be atomically claimed (docs/ROADMAP.md FDP-65) — e.g. a concurrent second refund attempt that already won the race — and never calls the provider", async () => {
      ordersService.adminFindOrThrow.mockResolvedValue({
        _id: { toString: () => 'order-1' },
        status: 'DELIVERED',
        paymentStatus: 'succeeded',
        paymentProvider: 'stripe',
        paymentRef: 'cs_test_abc',
      } as never);
      ordersService.claimForRefund.mockResolvedValue(null);

      await expect(service.refundOrder('order-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(stripeAdapter.refund).not.toHaveBeenCalled();
    });

    it('wraps a raw adapter refund error as a BadRequestException, reverts the claim, and never finalizes the refund', async () => {
      ordersService.adminFindOrThrow.mockResolvedValue({
        _id: { toString: () => 'order-1' },
        status: 'DELIVERED',
        paymentStatus: 'succeeded',
        paymentProvider: 'stripe',
        paymentRef: 'cs_test_abc',
      } as never);
      ordersService.claimForRefund.mockResolvedValue({
        status: 'DELIVERED',
      } as never);
      stripeAdapter.refund.mockRejectedValue(
        new Error('Charge already refunded'),
      );

      await expect(service.refundOrder('order-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(ordersService.revertFailedRefundClaim).toHaveBeenCalledWith(
        'order-1',
        'DELIVERED',
      );
      expect(ordersService.finalizeRefund).not.toHaveBeenCalled();
    });
  });

  describe('handleStripeAccountWebhook (FDP-54)', () => {
    it('does nothing for an unverifiable or non-account event', async () => {
      stripeAdapter.parseAccountWebhookEvent.mockReturnValue(null);

      await service.handleStripeAccountWebhook(Buffer.from('{}'), 'sig');

      expect(
        restaurantsService.findByPayoutAccountReference,
      ).not.toHaveBeenCalled();
    });

    it('does nothing when the account references no known restaurant', async () => {
      stripeAdapter.parseAccountWebhookEvent.mockReturnValue({
        accountId: 'acct_unknown',
        chargesEnabled: true,
        detailsSubmitted: true,
      });
      restaurantsService.findByPayoutAccountReference.mockResolvedValue(null);

      await service.handleStripeAccountWebhook(Buffer.from('{}'), 'sig');

      expect(
        restaurantsService.setPayoutAccountFromWebhook,
      ).not.toHaveBeenCalled();
    });

    it('flips a pending account to active and notifies the owner on the first activation', async () => {
      stripeAdapter.parseAccountWebhookEvent.mockReturnValue({
        accountId: 'acct_123',
        chargesEnabled: true,
        detailsSubmitted: true,
      });
      const restaurant = {
        _id: { toString: () => 'restaurant-1' },
        ownerId: { toString: () => 'owner-1' },
        name: 'Burgundy Kitchen',
        payoutAccounts: [
          { provider: 'stripe', status: 'pending', reference: 'acct_123' },
        ],
      };
      restaurantsService.findByPayoutAccountReference.mockResolvedValue(
        restaurant as never,
      );
      restaurantsService.setPayoutAccountFromWebhook.mockResolvedValue(
        restaurant as never,
      );

      await service.handleStripeAccountWebhook(Buffer.from('{}'), 'sig');

      expect(
        restaurantsService.setPayoutAccountFromWebhook,
      ).toHaveBeenCalledWith('restaurant-1', 'stripe', 'active', 'acct_123');
      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'owner-1',
          type: 'payout_account_changed',
        }),
      );
    });

    it('is a no-op when the account is already active — Stripe re-sends account.updated on any edit', async () => {
      stripeAdapter.parseAccountWebhookEvent.mockReturnValue({
        accountId: 'acct_123',
        chargesEnabled: true,
        detailsSubmitted: true,
      });
      restaurantsService.findByPayoutAccountReference.mockResolvedValue({
        _id: { toString: () => 'restaurant-1' },
        ownerId: { toString: () => 'owner-1' },
        name: 'Burgundy Kitchen',
        payoutAccounts: [
          { provider: 'stripe', status: 'active', reference: 'acct_123' },
        ],
      } as never);

      await service.handleStripeAccountWebhook(Buffer.from('{}'), 'sig');

      expect(
        restaurantsService.setPayoutAccountFromWebhook,
      ).not.toHaveBeenCalled();
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });

    it('flips an active account back to pending without notifying (not the security-relevant direction)', async () => {
      stripeAdapter.parseAccountWebhookEvent.mockReturnValue({
        accountId: 'acct_123',
        chargesEnabled: false,
        detailsSubmitted: true,
      });
      const restaurant = {
        _id: { toString: () => 'restaurant-1' },
        ownerId: { toString: () => 'owner-1' },
        name: 'Burgundy Kitchen',
        payoutAccounts: [
          { provider: 'stripe', status: 'active', reference: 'acct_123' },
        ],
      };
      restaurantsService.findByPayoutAccountReference.mockResolvedValue(
        restaurant as never,
      );
      restaurantsService.setPayoutAccountFromWebhook.mockResolvedValue(
        restaurant as never,
      );

      await service.handleStripeAccountWebhook(Buffer.from('{}'), 'sig');

      expect(
        restaurantsService.setPayoutAccountFromWebhook,
      ).toHaveBeenCalledWith('restaurant-1', 'stripe', 'pending', 'acct_123');
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });
  });
});
