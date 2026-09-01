import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { OrdersService } from '../orders/orders.service';
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
      | 'markRefunded'
    >
  >;
  let providerResolver: jest.Mocked<Pick<PaymentProviderResolver, 'resolve'>>;
  let stripeAdapter: {
    initiate: jest.Mock;
    verify: jest.Mock;
    handleWebhook: jest.Mock;
    refund: jest.Mock;
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
      markRefunded: jest.fn(),
    };
    providerResolver = { resolve: jest.fn() };
    stripeAdapter = {
      initiate: jest.fn(),
      verify: jest.fn(),
      handleWebhook: jest.fn(),
      refund: jest.fn(),
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
      );
    });

    it('rejects a provider override the currency does not support', async () => {
      ordersService.findOne.mockResolvedValue({
        _id: { toString: () => 'order-1' },
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
      );
    });

    it("wraps a raw adapter error (e.g. the provider's own API rejection) as a BadRequestException instead of letting it surface as a 500", async () => {
      // Found via live testing against the real Stripe API (FDP-14): a tiny order total
      // triggers Stripe's ~$0.50 minimum-charge rejection, which previously bubbled up as an
      // opaque "Internal server error".
      const order = {
        _id: { toString: () => 'order-1' },
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

      await expect(
        service.verifyPayment(user.sub, 'order-1'),
      ).rejects.toThrow(BadRequestException);
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
      expect(ordersService.markPaidFromWebhook).toHaveBeenCalledWith(
        'order-1',
      );
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
      } as never);

      await service.handleWebhook('stripe', Buffer.from('{}'), 'sig');

      expect(ordersService.markPaymentFailed).toHaveBeenCalledWith('order-1');
      expect(ordersService.markPaidFromWebhook).not.toHaveBeenCalled();
    });
  });

  describe('refundOrder', () => {
    it("refunds via the order's provider adapter and marks the order refunded", async () => {
      const order = {
        _id: { toString: () => 'order-1' },
        status: 'DELIVERED',
        paymentStatus: 'succeeded',
        paymentProvider: 'stripe',
        paymentRef: 'cs_test_abc',
      };
      ordersService.adminFindOrThrow.mockResolvedValue(order as never);
      stripeAdapter.refund.mockResolvedValue(undefined);
      ordersService.markRefunded.mockResolvedValue({
        status: 'REFUNDED',
      } as never);

      const result = await service.refundOrder('order-1');

      expect(stripeAdapter.refund).toHaveBeenCalledWith('cs_test_abc');
      expect(ordersService.markRefunded).toHaveBeenCalledWith('order-1');
      expect(result).toEqual({ status: 'REFUNDED' });
    });

    it('rejects a refund for an order that is not DELIVERED', async () => {
      ordersService.adminFindOrThrow.mockResolvedValue({
        status: 'PREPARING',
        paymentStatus: 'succeeded',
        paymentProvider: 'stripe',
        paymentRef: 'cs_test_abc',
      } as never);

      await expect(service.refundOrder('order-1')).rejects.toThrow(
        BadRequestException,
      );
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

    it('wraps a raw adapter refund error as a BadRequestException, and never marks the order refunded', async () => {
      ordersService.adminFindOrThrow.mockResolvedValue({
        _id: { toString: () => 'order-1' },
        status: 'DELIVERED',
        paymentStatus: 'succeeded',
        paymentProvider: 'stripe',
        paymentRef: 'cs_test_abc',
      } as never);
      stripeAdapter.refund.mockRejectedValue(
        new Error('Charge already refunded'),
      );

      await expect(service.refundOrder('order-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(ordersService.markRefunded).not.toHaveBeenCalled();
    });
  });
});
