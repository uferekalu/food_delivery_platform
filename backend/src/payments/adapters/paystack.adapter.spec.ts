import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PaystackAdapter } from './paystack.adapter';

// A locally-chosen test secret, not the real one from .env — Paystack signs webhooks with
// HMAC-SHA512 of the raw body using the account's secret key, so this proves the verification
// logic is correct without any network access or real credentials.
const TEST_SECRET = 'sk_test_local_verification_secret';

function configWith(secret: string): ConfigService {
  return {
    getOrThrow: (key: string) =>
      key === 'PAYSTACK_SECRET_KEY' ? secret : 'unused',
  } as ConfigService;
}

function sign(secret: string, body: string): string {
  return createHmac('sha512', secret).update(body).digest('hex');
}

describe('PaystackAdapter', () => {
  describe('handleWebhook', () => {
    let adapter: PaystackAdapter;

    beforeEach(() => {
      adapter = new PaystackAdapter(configWith(TEST_SECRET));
    });

    it('returns null when no signature header is present', async () => {
      const result = await adapter.handleWebhook(Buffer.from('{}'), undefined);
      expect(result).toBeNull();
    });

    it('returns null for an incorrect signature', async () => {
      const body = JSON.stringify({
        event: 'charge.success',
        data: { reference: 'ref_123', status: 'success' },
      });
      const result = await adapter.handleWebhook(
        Buffer.from(body),
        '0'.repeat(128),
      );
      expect(result).toBeNull();
    });

    it('accepts a genuinely signed charge.success event', async () => {
      const body = JSON.stringify({
        event: 'charge.success',
        data: { reference: 'ref_123', status: 'success' },
      });
      const signature = sign(TEST_SECRET, body);

      const result = await adapter.handleWebhook(Buffer.from(body), signature);

      expect(result).toEqual({ reference: 'ref_123', success: true });
    });

    it('ignores an event type it does not act on', async () => {
      const body = JSON.stringify({
        event: 'transfer.success',
        data: { reference: 'ref_123', status: 'success' },
      });
      const signature = sign(TEST_SECRET, body);

      const result = await adapter.handleWebhook(Buffer.from(body), signature);
      expect(result).toBeNull();
    });

    it('reports failure for a charge that did not succeed', async () => {
      const body = JSON.stringify({
        event: 'charge.success',
        data: { reference: 'ref_123', status: 'failed' },
      });
      const signature = sign(TEST_SECRET, body);

      const result = await adapter.handleWebhook(Buffer.from(body), signature);
      expect(result).toEqual({ reference: 'ref_123', success: false });
    });

    it('rejects a signature computed with the wrong secret', async () => {
      const body = JSON.stringify({
        event: 'charge.success',
        data: { reference: 'ref_123', status: 'success' },
      });
      const signature = sign('a-completely-different-secret', body);

      const result = await adapter.handleWebhook(Buffer.from(body), signature);
      expect(result).toBeNull();
    });
  });

  describe('initiate', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('returns the authorization_url and reference on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: true,
            data: {
              authorization_url: 'https://checkout.paystack.com/abc',
              reference: 'ORD-1-abcd',
            },
          }),
      }) as never;

      const adapter = new PaystackAdapter(configWith(TEST_SECRET));
      const result = await adapter.initiate({
        orderId: 'order-1',
        orderNumber: 'ORD-1',
        amount: 50,
        currency: 'NGN',
        customerEmail: 'jane@example.com',
        successUrl: 'http://localhost:3000/checkout/callback',
        cancelUrl: 'http://localhost:3000/checkout/callback?cancelled=true',
      });

      expect(result).toEqual({
        redirectUrl: 'https://checkout.paystack.com/abc',
        reference: 'ORD-1-abcd',
      });
    });

    it('throws when Paystack reports failure', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ status: false, message: 'Invalid key' }),
      }) as never;

      const adapter = new PaystackAdapter(configWith(TEST_SECRET));
      await expect(
        adapter.initiate({
          orderId: 'order-1',
          orderNumber: 'ORD-1',
          amount: 50,
          currency: 'NGN',
          customerEmail: 'jane@example.com',
          successUrl: 'http://localhost:3000',
          cancelUrl: 'http://localhost:3000',
        }),
      ).rejects.toThrow('Invalid key');
    });
  });
});
