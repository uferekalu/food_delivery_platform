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

    it("ignores a correctly-signed event whose type isn't a charge result (docs/ROADMAP.md FDP-65) — unlike Stripe/Paystack, this previously never checked `event` at all", async () => {
      const body = JSON.stringify({
        event: 'transfer.completed',
        data: { id: 1, tx_ref: 'ORD-1-abcd', status: 'successful' },
      });

      const result = await adapter.handleWebhook(
        Buffer.from(body),
        TEST_WEBHOOK_HASH,
      );

      expect(result).toBeNull();
    });

    it('returns null (never throws) for a correctly-signed event whose body has no data field (docs/ROADMAP.md FDP-65) — previously threw an uncaught TypeError', async () => {
      const body = JSON.stringify({ event: 'charge.completed' });

      const result = await adapter.handleWebhook(
        Buffer.from(body),
        TEST_WEBHOOK_HASH,
      );

      expect(result).toBeNull();
    });

    it('returns null (never throws) for a correctly-signed event whose body is not valid JSON', async () => {
      const result = await adapter.handleWebhook(
        Buffer.from('not json'),
        TEST_WEBHOOK_HASH,
      );

      expect(result).toBeNull();
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

    it("splits the transaction via a subaccounts entry when the restaurant has an active payout account — transaction_charge is the flat amount the SUBACCOUNT receives, not the platform (flat_subaccount is the inverse of Paystack's transaction_charge direction)", async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { link: 'https://checkout.flutterwave.com/abc' },
          }),
      });
      global.fetch = fetchMock as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
      await adapter.initiate({
        orderId: 'order-1',
        orderNumber: 'ORD-1',
        amount: 115, // order.total: subtotal 100 + deliveryFee 10 + serviceFee 5
        currency: 'NGN',
        customerEmail: 'jane@example.com',
        successUrl: 'http://localhost:3000',
        cancelUrl: 'http://localhost:3000',
        restaurantPayoutAccountReference: 'RS_test123',
        restaurantPayoutAmount: 85, // 100 subtotal - 15 platform commission
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as {
        subaccounts: {
          id: string;
          transaction_charge_type: string;
          transaction_charge: number;
        }[];
      };
      expect(body.subaccounts).toEqual([
        {
          id: 'RS_test123',
          transaction_charge_type: 'flat_subaccount',
          transaction_charge: 85,
        },
      ]);
    });

    it('omits the subaccounts field entirely when the restaurant has no active payout account', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { link: 'https://checkout.flutterwave.com/abc' },
          }),
      });
      global.fetch = fetchMock as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
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
      expect(body.subaccounts).toBeUndefined();
    });
  });

  describe('listBanks', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('maps the bank list to {name, code} on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: 'success',
            data: [{ id: 1, code: '044', name: 'Access Bank' }],
          }),
      }) as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
      const banks = await adapter.listBanks();

      expect(banks).toEqual([{ name: 'Access Bank', code: '044' }]);
    });

    it('throws when Flutterwave reports failure', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({ status: 'error', message: 'Service unavailable' }),
      }) as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
      await expect(adapter.listBanks()).rejects.toThrow('Service unavailable');
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
            status: 'success',
            data: { account_number: '0690000031', account_name: 'Jane Doe' },
          }),
      }) as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
      const result = await adapter.resolveAccount('0690000031', '044');

      expect(result).toEqual({
        accountNumber: '0690000031',
        accountName: 'Jane Doe',
      });
    });

    it('throws when the account cannot be resolved', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: 'error',
            message: 'Could not resolve account name',
          }),
      }) as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
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

    it('returns the new subaccount id on success', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { subaccount_id: 'RS_new123' },
          }),
      });
      global.fetch = fetchMock as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
      const result = await adapter.createSubaccount({
        businessName: 'Burgundy Kitchen',
        businessEmail: 'owner@example.com',
        bankCode: '044',
        accountNumber: '0690000031',
        splitValue: 0.15,
      });

      expect(result).toEqual({ subaccountId: 'RS_new123' });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as {
        account_bank: string;
        account_number: string;
        business_name: string;
        business_email: string;
        country: string;
        split_type: string;
        split_value: number;
      };
      expect(body).toEqual({
        account_bank: '044',
        account_number: '0690000031',
        business_name: 'Burgundy Kitchen',
        business_email: 'owner@example.com',
        country: 'NG',
        split_type: 'percentage',
        split_value: 0.15,
      });
    });

    it('throws when Flutterwave rejects the subaccount', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: 'error',
            message: 'Invalid account number',
          }),
      }) as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
      await expect(
        adapter.createSubaccount({
          businessName: 'Burgundy Kitchen',
          businessEmail: 'owner@example.com',
          bankCode: '044',
          accountNumber: '0000000000',
          splitValue: 0.15,
        }),
      ).rejects.toThrow('Invalid account number');
    });
  });

  describe('refund', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('verifies the transaction then refunds it on success', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              status: 'success',
              data: { id: 42, status: 'successful', tx_ref: 'ORD-1-abcd' },
            }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ status: 'success' }),
        });
      global.fetch = fetchMock as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
      await adapter.refund('ORD-1-abcd');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [refundUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(refundUrl).toContain('/transactions/42/refund');
    });

    it("throws (docs/ROADMAP.md FDP-65) rather than silently succeeding when the original transaction can't be found — previously a bare `return` treated as success", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ status: 'error', data: null }),
      }) as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
      await expect(adapter.refund('ORD-missing')).rejects.toThrow(
        'Could not find the original Flutterwave transaction to refund',
      );
    });

    it('throws (docs/ROADMAP.md FDP-65) when Flutterwave rejects the refund itself — previously the response was never checked at all', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              status: 'success',
              data: { id: 42, status: 'successful', tx_ref: 'ORD-1-abcd' },
            }),
        })
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              status: 'error',
              message: 'Transaction already refunded',
            }),
        });
      global.fetch = fetchMock as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
      await expect(adapter.refund('ORD-1-abcd')).rejects.toThrow(
        'Transaction already refunded',
      );
    });
  });

  describe('transfer (docs/ROADMAP.md FDP-92)', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    const params = {
      bankCode: '044',
      accountNumber: '0123456789',
      amount: 85,
      currency: 'NGN',
      reference: 'payout-1',
      narration: 'Weekly payout',
    };

    it('returns the transfer id on success, sending the raw bank details (no subaccount API for Flutterwave transfers)', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { id: 998877, reference: 'payout-1' },
          }),
      });
      global.fetch = fetchMock as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
      const result = await adapter.transfer(params);

      expect(result).toEqual({ transferReference: '998877' });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as {
        account_bank: string;
        account_number: string;
        amount: number;
      };
      expect(body).toEqual({
        account_bank: '044',
        account_number: '0123456789',
        amount: 85, // major unit, no ×100 — same as initiate()
        currency: 'NGN',
        narration: 'Weekly payout',
        reference: 'payout-1',
      });
    });

    it('throws a plain Error on a confirmed rejection (safe to retry)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({ status: 'error', message: 'Invalid account' }),
      }) as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
      await expect(adapter.transfer(params)).rejects.toThrow('Invalid account');
    });

    it('throws TransferOutcomeUnknownError (not a plain Error) on a network-layer failure — outcome genuinely unknown', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('fetch failed')) as never;

      const adapter = new FlutterwaveAdapter(configWith(TEST_WEBHOOK_HASH));
      await expect(adapter.transfer(params)).rejects.toMatchObject({
        name: 'TransferOutcomeUnknownError',
      });
    });
  });
});
