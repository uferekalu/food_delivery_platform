import { ConfigService } from '@nestjs/config';
import { FlutterwaveAdapter } from './flutterwave.adapter';

const TEST_WEBHOOK_HASH = 'local-verification-hash';

function configWith(hash: string): ConfigService {
  return {
    getOrThrow: (key: string) =>
      key === 'FLUTTERWAVE_WEBHOOK_HASH' ? hash : 'FLWSECK_TEST-dummy',
  } as ConfigService;
}

describe('FlutterwaveAdapter', () => {
  describe('handleWebhook', () => {
    let adapter: FlutterwaveAdapter;

    beforeEach(() => {
      adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
    });

    it('returns null when no signature header is present', async () => {
      const result = await adapter.handleWebhook(Buffer.from('{}'), undefined);
      expect(result).toBeNull();
    });

    it('returns null when the header does not match the configured hash', async () => {
      const body = JSON.stringify({
        event: 'charge.completed',
        data: { id: 1, tx_ref: 'ORD-1-abcd', status: 'successful' },
      });
      const result = await adapter.handleWebhook(
        Buffer.from(body),
        'wrong-hash',
      );
      expect(result).toBeNull();
    });

    it('accepts an event whose header matches the configured hash', async () => {
      const body = JSON.stringify({
        event: 'charge.completed',
        data: { id: 1, tx_ref: 'ORD-1-abcd', status: 'successful' },
      });

      const result = await adapter.handleWebhook(
        Buffer.from(body),
        TEST_WEBHOOK_HASH,
      );

      expect(result).toEqual({ reference: 'ORD-1-abcd', success: true });
    });

    it('reports failure for a non-successful status', async () => {
      const body = JSON.stringify({
        event: 'charge.completed',
        data: { id: 1, tx_ref: 'ORD-1-abcd', status: 'failed' },
      });

      const result = await adapter.handleWebhook(
        Buffer.from(body),
        TEST_WEBHOOK_HASH,
      );

      expect(result).toEqual({ reference: 'ORD-1-abcd', success: false });
    });
  });

  describe('initiate', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('returns the payment link and generated tx_ref on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { link: 'https://checkout.flutterwave.com/abc' },
          }),
      }) as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
      const result = await adapter.initiate({
        orderId: 'order-1',
        orderNumber: 'ORD-1',
        amount: 50,
        currency: 'GHS',
        customerEmail: 'jane@example.com',
        successUrl: 'http://localhost:3000/checkout/callback',
        cancelUrl: 'http://localhost:3000/checkout/callback?cancelled=true',
      });

      expect(result.redirectUrl).toBe('https://checkout.flutterwave.com/abc');
      expect(result.reference).toMatch(/^ORD-1-/);
    });

    it('throws when Flutterwave reports failure', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({ status: 'error', message: 'Invalid key' }),
      }) as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
      await expect(
        adapter.initiate({
          orderId: 'order-1',
          orderNumber: 'ORD-1',
          amount: 50,
          currency: 'GHS',
          customerEmail: 'jane@example.com',
          successUrl: 'http://localhost:3000',
          cancelUrl: 'http://localhost:3000',
        }),
      ).rejects.toThrow('Invalid key');
    });
  });
});
