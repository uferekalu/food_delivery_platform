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

  describe('initiate', () => {
    let adapter: StripeAdapter;
    let createMock: jest.Mock<
      Promise<{ id: string; url: string }>,
      [Record<string, unknown>]
    >;

    beforeEach(() => {
      adapter = new StripeAdapter(configWith(TEST_WEBHOOK_SECRET));
      createMock = jest
        .fn<Promise<{ id: string; url: string }>, [Record<string, unknown>]>()
        .mockResolvedValue({
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

    it('creates a checkout session for the full order amount and returns its url/reference — no vendor-split fields (docs/ROADMAP.md FDP-95 removed the instant charge-time split)', async () => {
      const result = await adapter.initiate({
        orderId: 'order-1',
        orderNumber: 'ORD-1',
        amount: 115,
        currency: 'USD',
        customerEmail: 'jane@example.com',
        successUrl: 'http://localhost:3000',
        cancelUrl: 'http://localhost:3000',
      });

      expect(result).toEqual({
        redirectUrl: 'https://checkout.stripe.com/session/abc',
        reference: 'cs_test_abc',
      });
      const body = createMock.mock.calls[0][0];
      expect(body.payment_intent_data).toBeUndefined();
      expect(body).not.toHaveProperty('transfer_data');
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

  describe('transfer (docs/ROADMAP.md FDP-92)', () => {
    let adapter: StripeAdapter;

    beforeEach(() => {
      adapter = new StripeAdapter(configWith(TEST_WEBHOOK_SECRET));
    });

    const params = {
      destinationAccountId: 'acct_test123',
      amount: 85,
      currency: 'USD',
      reference: 'payout-1',
      description: 'Weekly payout',
    };

    it('creates a standalone transfer with the reference as its idempotency key, returning the transfer id', async () => {
      const createMock = jest.fn().mockResolvedValue({ id: 'tr_test_abc' });
      (adapter as unknown as { stripe: Stripe }).stripe = {
        transfers: { create: createMock },
      } as unknown as Stripe;

      const result = await adapter.transfer(params);

      expect(result).toEqual({ transferReference: 'tr_test_abc' });
      expect(createMock).toHaveBeenCalledWith(
        {
          amount: 8500,
          currency: 'usd',
          destination: 'acct_test123',
          description: 'Weekly payout',
          transfer_group: 'payout-1',
        },
        { idempotencyKey: 'payout-1' },
      );
    });

    it('throws a plain Error on a confirmed rejection (e.g. an invalid/disabled destination account) — safe to retry', async () => {
      const createMock = jest.fn().mockRejectedValue(
        new Stripe.errors.StripeInvalidRequestError({
          message: 'No such destination account',
        }),
      );
      (adapter as unknown as { stripe: Stripe }).stripe = {
        transfers: { create: createMock },
      } as unknown as Stripe;

      await expect(adapter.transfer(params)).rejects.toThrow(
        'No such destination account',
      );
    });

    it('throws TransferOutcomeUnknownError (not a plain Error) on a connection error — outcome genuinely unknown', async () => {
      const createMock = jest
        .fn()
        .mockRejectedValue(
          new Stripe.errors.StripeConnectionError({ message: 'ECONNRESET' }),
        );
      (adapter as unknown as { stripe: Stripe }).stripe = {
        transfers: { create: createMock },
      } as unknown as Stripe;

      await expect(adapter.transfer(params)).rejects.toMatchObject({
        name: 'TransferOutcomeUnknownError',
      });
    });

    it("throws TransferOutcomeUnknownError on Stripe's own 5xx (StripeAPIError) — its docs say a valid request may still have been processed", async () => {
      const createMock = jest
        .fn()
        .mockRejectedValue(
          new Stripe.errors.StripeAPIError({ message: 'internal error' }),
        );
      (adapter as unknown as { stripe: Stripe }).stripe = {
        transfers: { create: createMock },
      } as unknown as Stripe;

      await expect(adapter.transfer(params)).rejects.toMatchObject({
        name: 'TransferOutcomeUnknownError',
      });
    });
  });
});
