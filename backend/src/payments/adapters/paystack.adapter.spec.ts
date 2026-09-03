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

    it('splits the transaction via subaccount when the restaurant has an active payout account — computing transaction_charge from restaurantPayoutAmount, never a flat percentage of the whole total', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: true,
            data: {
              authorization_url: 'https://checkout.paystack.com/abc',
              reference: 'ORD-1-abcd',
            },
          }),
      });
      global.fetch = fetchMock as never;

      const adapter = new PaystackAdapter(configWith(TEST_SECRET));
      await adapter.initiate({
        orderId: 'order-1',
        orderNumber: 'ORD-1',
        amount: 115, // order.total: subtotal 100 + deliveryFee 10 + serviceFee 5
        currency: 'NGN',
        customerEmail: 'jane@example.com',
        successUrl: 'http://localhost:3000',
        cancelUrl: 'http://localhost:3000',
        restaurantPayoutAccountReference: 'ACCT_test123',
        restaurantPayoutAmount: 85, // 100 subtotal - 15 platform commission
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as {
        subaccount: string;
        transaction_charge: number;
        bearer: string;
      };
      expect(body.subaccount).toBe('ACCT_test123');
      // Platform keeps everything except the restaurant's share: (115 - 85) * 100 kobo
      expect(body.transaction_charge).toBe(3000);
      expect(body.bearer).toBe('account');
    });

    it('omits the split fields entirely when the restaurant has no active payout account', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: true,
            data: {
              authorization_url: 'https://checkout.paystack.com/abc',
              reference: 'ORD-1-abcd',
            },
          }),
      });
      global.fetch = fetchMock as never;

      const adapter = new PaystackAdapter(configWith(TEST_SECRET));
      await adapter.initiate({
        orderId: 'order-1',
        orderNumber: 'ORD-1',
        amount: 115,
        currency: 'NGN',
        customerEmail: 'jane@example.com',
        successUrl: 'http://localhost:3000',
        cancelUrl: 'http://localhost:3000',
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.subaccount).toBeUndefined();
      expect(body.transaction_charge).toBeUndefined();
      expect(body.bearer).toBeUndefined();
    });
  });

  describe('listBanks', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('returns the bank list on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: true,
            data: [{ name: 'Access Bank', code: '044' }],
          }),
      }) as never;

      // A live key (not TEST_SECRET, which is a sk_test_ value) — isolates this assertion from
      // the test-mode "Test Bank" injection covered separately below.
      const adapter = new PaystackAdapter(configWith('sk_live_something'));
      const banks = await adapter.listBanks();

      expect(banks).toEqual([{ name: 'Access Bank', code: '044' }]);
    });

    it('throws when Paystack reports failure', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({ status: false, message: 'Service unavailable' }),
      }) as never;

      const adapter = new PaystackAdapter(configWith(TEST_SECRET));
      await expect(adapter.listBanks()).rejects.toThrow('Service unavailable');
    });

    it("appends Paystack's sandbox Test Bank (code 001) when running on a test-mode key — Paystack caps real bank resolves at 3/day in test mode, and 001 is the documented way around that", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: true,
            data: [{ name: 'Access Bank', code: '044' }],
          }),
      }) as never;

      const adapter = new PaystackAdapter(configWith(TEST_SECRET)); // sk_test_...
      const banks = await adapter.listBanks();

      expect(banks).toEqual([
        { name: 'Access Bank', code: '044' },
        expect.objectContaining({ code: '001' }),
      ]);
    });

    it('never appends the Test Bank when running on a live key', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: true,
            data: [{ name: 'Access Bank', code: '044' }],
          }),
      }) as never;

      const adapter = new PaystackAdapter(configWith('sk_live_something'));
      const banks = await adapter.listBanks();

      expect(banks.some((b) => b.code === '001')).toBe(false);
    });
  });

  describe('resolveAccount', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('returns the resolved account name on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: true,
            data: { account_number: '0123456789', account_name: 'Jane Doe' },
          }),
      }) as never;

      const adapter = new PaystackAdapter(configWith(TEST_SECRET));
      const result = await adapter.resolveAccount('0123456789', '044');

      expect(result).toEqual({
        accountNumber: '0123456789',
        accountName: 'Jane Doe',
      });
    });

    it('throws when the account cannot be resolved', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: false,
            message: 'Could not resolve account name',
          }),
      }) as never;

      const adapter = new PaystackAdapter(configWith(TEST_SECRET));
      await expect(adapter.resolveAccount('0000000000', '044')).rejects.toThrow(
        'Could not resolve account name',
      );
    });
  });

  describe('createSubaccount', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('returns the new subaccount code on success', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: true,
            data: { subaccount_code: 'ACCT_new123' },
          }),
      });
      global.fetch = fetchMock as never;

      const adapter = new PaystackAdapter(configWith(TEST_SECRET));
      const result = await adapter.createSubaccount({
        businessName: 'Burgundy Kitchen',
        bankCode: '044',
        accountNumber: '0123456789',
        percentageCharge: 15,
      });

      expect(result).toEqual({ subaccountCode: 'ACCT_new123' });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as {
        business_name: string;
        settlement_bank: string;
        account_number: string;
        percentage_charge: number;
      };
      expect(body).toEqual({
        business_name: 'Burgundy Kitchen',
        settlement_bank: '044',
        account_number: '0123456789',
        percentage_charge: 15,
      });
    });

    it('throws when Paystack rejects the subaccount', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({ status: false, message: 'Invalid account number' }),
      }) as never;

      const adapter = new PaystackAdapter(configWith(TEST_SECRET));
      await expect(
        adapter.createSubaccount({
          businessName: 'Burgundy Kitchen',
          bankCode: '044',
          accountNumber: '0000000000',
          percentageCharge: 15,
        }),
      ).rejects.toThrow('Invalid account number');
    });
  });

  describe('refund', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('resolves on a successful refund', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ status: true }),
      }) as never;

      const adapter = new PaystackAdapter(configWith(TEST_SECRET));
      await expect(adapter.refund('ref_123')).resolves.toBeUndefined();
    });

    it('throws (docs/ROADMAP.md FDP-65) rather than silently succeeding when Paystack rejects the refund — previously the response was discarded entirely', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: false,
            message: 'Insufficient balance in main account',
          }),
      }) as never;

      const adapter = new PaystackAdapter(configWith(TEST_SECRET));
      await expect(adapter.refund('ref_123')).rejects.toThrow(
        'Insufficient balance in main account',
      );
    });
  });
});
