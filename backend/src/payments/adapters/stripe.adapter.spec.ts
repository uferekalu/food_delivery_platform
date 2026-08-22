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
});
