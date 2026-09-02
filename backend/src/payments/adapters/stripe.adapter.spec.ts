import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeAdapter } from './stripe.adapter';

// A locally-generated test secret, not the real one from .env — handleWebhook's signature
// verification is pure local crypto (HMAC-SHA256 of timestamp+payload), so this proves the
// verification logic is correct without any network access or real credentials.
const TEST_WEBHOOK_SECRET = 'whsec_test_' + 'a'.repeat(32);

function configWith(secret: string): ConfigService {
  return {
    getOrThrow: (key: string) =>
      key === 'STRIPE_WEBHOOK_SECRET' ? secret : 'sk_test_dummy',
  } as ConfigService;
}

describe('StripeAdapter', () => {
  describe('handleWebhook', () => {
    let adapter: StripeAdapter;

    beforeEach(() => {
      adapter = new StripeAdapter(configWith(TEST_WEBHOOK_SECRET));
    });

    it('returns null when no signature header is present', async () => {
      const result = await adapter.handleWebhook(Buffer.from('{}'), undefined);
      expect(result).toBeNull();
    });

    it('returns null for a tampered/invalid signature', async () => {
      const result = await adapter.handleWebhook(
        Buffer.from('{}'),
        't=1,v1=not-a-real-signature',
      );
      expect(result).toBeNull();
    });

    it('accepts a genuinely signed checkout.session.completed event', async () => {
      const payload = JSON.stringify({
        id: 'evt_test',
        object: 'event',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_abc123',
            object: 'checkout.session',
            payment_status: 'paid',
          },
        },
      });
      const header = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: TEST_WEBHOOK_SECRET,
      });

      const result = await adapter.handleWebhook(Buffer.from(payload), header);

      expect(result).toEqual({ reference: 'cs_test_abc123', success: true });
    });

    it('ignores an event type it does not act on', async () => {
      const payload = JSON.stringify({
        id: 'evt_test',
        object: 'event',
        type: 'payment_intent.created',
        data: { object: {} },
      });
      const header = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: TEST_WEBHOOK_SECRET,
      });

      const result = await adapter.handleWebhook(Buffer.from(payload), header);
      expect(result).toBeNull();
    });

    it('rejects a signature computed with the wrong secret', async () => {
      const payload = JSON.stringify({
        id: 'evt_test',
        object: 'event',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_abc', payment_status: 'paid' } },
      });
      const header = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: 'whsec_wrong_secret_' + 'b'.repeat(32),
      });

      const result = await adapter.handleWebhook(Buffer.from(payload), header);
      expect(result).toBeNull();
    });
  });

  describe('initiate — split payment (FDP-54)', () => {
    let adapter: StripeAdapter;
    let createMock: jest.Mock;

    beforeEach(() => {
      adapter = new StripeAdapter(configWith(TEST_WEBHOOK_SECRET));
      createMock = jest.fn().mockResolvedValue({
        id: 'cs_test_abc',
        url: 'https://checkout.stripe.com/session/abc',
      });
      // The Stripe SDK client is constructed internally, not injected — overriding the method
      // directly on the real client instance is the simplest way to intercept the network call
      // without mocking the `stripe` package's constructor.
      (adapter as unknown as { stripe: Stripe }).stripe = {
        checkout: { sessions: { create: createMock } },
      } as unknown as Stripe;
    });

    it("adds transfer_data/application_fee_amount — application_fee_amount is what the PLATFORM keeps, the connected account automatically receives the rest (Stripe's destination-charge model)", async () => {
      await adapter.initiate({
        orderId: 'order-1',
        orderNumber: 'ORD-1',
        amount: 115, // order.total: subtotal 100 + deliveryFee 10 + serviceFee 5
        currency: 'USD',
        customerEmail: 'jane@example.com',
        successUrl: 'http://localhost:3000',
        cancelUrl: 'http://localhost:3000',
        restaurantPayoutAccountReference: 'acct_test123',
        restaurantPayoutAmount: 85, // 100 subtotal - 15 platform commission
      });

      const body = createMock.mock.calls[0][0] as {
        payment_intent_data?: {
          application_fee_amount: number;
          transfer_data: { destination: string };
        };
      };
      expect(body.payment_intent_data).toEqual({
        application_fee_amount: 3000, // (115 - 85) * 100 cents
        transfer_data: { destination: 'acct_test123' },
      });
    });

    it('omits payment_intent_data entirely when the restaurant has no active payout account', async () => {
      await adapter.initiate({
        orderId: 'order-1',
        orderNumber: 'ORD-1',
        amount: 115,
        currency: 'USD',
        customerEmail: 'jane@example.com',
        successUrl: 'http://localhost:3000',
        cancelUrl: 'http://localhost:3000',
      });

      const body = createMock.mock.calls[0][0] as Record<string, unknown>;
      expect(body.payment_intent_data).toBeUndefined();
    });
  });

  describe('Connect onboarding (FDP-54)', () => {
    let adapter: StripeAdapter;

    beforeEach(() => {
      adapter = new StripeAdapter(configWith(TEST_WEBHOOK_SECRET));
    });

    it('createConnectedAccount requests an Express account with card_payments/transfers capabilities', async () => {
      const createMock = jest.fn().mockResolvedValue({ id: 'acct_new123' });
      (adapter as unknown as { stripe: Stripe }).stripe = {
        accounts: { create: createMock },
      } as unknown as Stripe;

      const result = await adapter.createConnectedAccount('owner@example.com');

      expect(result).toEqual({ accountId: 'acct_new123' });
      expect(createMock).toHaveBeenCalledWith({
        type: 'express',
        email: 'owner@example.com',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
    });

    it('createOnboardingLink returns a fresh hosted onboarding URL for the given account', async () => {
      const createMock = jest.fn().mockResolvedValue({
        url: 'https://connect.stripe.com/setup/e/acct_123/abc',
      });
      (adapter as unknown as { stripe: Stripe }).stripe = {
        accountLinks: { create: createMock },
      } as unknown as Stripe;

      const result = await adapter.createOnboardingLink(
        'acct_123',
        'http://localhost:3000/refresh',
        'http://localhost:3000/return',
      );

      expect(result).toEqual({
        url: 'https://connect.stripe.com/setup/e/acct_123/abc',
      });
      expect(createMock).toHaveBeenCalledWith({
        account: 'acct_123',
        refresh_url: 'http://localhost:3000/refresh',
        return_url: 'http://localhost:3000/return',
        type: 'account_onboarding',
      });
    });
  });

  describe('parseAccountWebhookEvent (FDP-54)', () => {
    let adapter: StripeAdapter;

    beforeEach(() => {
      adapter = new StripeAdapter(configWith(TEST_WEBHOOK_SECRET));
    });

    it('returns null when no signature header is present', () => {
      const result = adapter.parseAccountWebhookEvent(
        Buffer.from('{}'),
        undefined,
      );
      expect(result).toBeNull();
    });

    it('parses a genuinely signed account.updated event', () => {
      const payload = JSON.stringify({
        id: 'evt_test',
        object: 'event',
        type: 'account.updated',
        data: {
          object: {
            id: 'acct_123',
            object: 'account',
            charges_enabled: true,
            details_submitted: true,
          },
        },
      });
      const header = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: TEST_WEBHOOK_SECRET,
      });

      const result = adapter.parseAccountWebhookEvent(
        Buffer.from(payload),
        header,
      );

      expect(result).toEqual({
        accountId: 'acct_123',
        chargesEnabled: true,
        detailsSubmitted: true,
      });
    });

    it('ignores an event type it does not act on (e.g. checkout.session.completed)', () => {
      const payload = JSON.stringify({
        id: 'evt_test',
        object: 'event',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_abc', payment_status: 'paid' } },
      });
      const header = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: TEST_WEBHOOK_SECRET,
      });

      const result = adapter.parseAccountWebhookEvent(
        Buffer.from(payload),
        header,
      );
      expect(result).toBeNull();
    });

    it('rejects a signature computed with the wrong secret', () => {
      const payload = JSON.stringify({
        id: 'evt_test',
        object: 'event',
        type: 'account.updated',
        data: {
          object: {
            id: 'acct_123',
            charges_enabled: true,
            details_submitted: true,
          },
        },
      });
      const header = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: 'whsec_wrong_secret_' + 'b'.repeat(32),
      });

      const result = adapter.parseAccountWebhookEvent(
        Buffer.from(payload),
        header,
      );
      expect(result).toBeNull();
    });
  });
});
