import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, timingSafeEqual } from 'crypto';
import type {
  InitiatePaymentParams,
  InitiatePaymentResult,
  PaymentAdapter,
  VerifyPaymentResult,
  WebhookEvent,
} from './payment-adapter.interface';

const BASE_URL = 'https://api.flutterwave.com/v3';

interface FlutterwaveInitializeResponse {
  status: string;
  data?: { link: string };
  message?: string;
}

interface FlutterwaveVerifyResponse {
  status: string;
  data?: { id: number; status: string; tx_ref: string };
}

interface FlutterwaveWebhookPayload {
  event: string;
  data: { id: number; status: string; tx_ref: string };
}

export interface FlutterwaveBank {
  name: string;
  code: string;
}

interface FlutterwaveListBanksResponse {
  status: string;
  data?: { id: number; code: string; name: string }[];
  message?: string;
}

interface FlutterwaveResolveAccountResponse {
  status: string;
  data?: { account_number: string; account_name: string };
  message?: string;
}

interface FlutterwaveCreateSubaccountResponse {
  status: string;
  data?: { subaccount_id: string };
  message?: string;
}

// Flutterwave's "Standard" hosted checkout — see stripe.adapter.ts for why a hosted redirect.
// Covers the African-currency leg of docs/ARCHITECTURE.md §4's routing table not handled by
// Paystack (GHS/KES/ZAR/UGX/...). Unlike Stripe/Paystack, Flutterwave's webhook auth is a
// static shared secret echoed back verbatim in `verif-hash` — not an HMAC of the body — so
// there's nothing to sign/compute here, only a constant-time string comparison.
@Injectable()
export class FlutterwaveAdapter implements PaymentAdapter {
  private readonly secretKey: string;
  private readonly webhookHash: string;

  constructor(config: ConfigService) {
    this.secretKey = config.getOrThrow<string>('FLUTTERWAVE_SECRET_KEY');
    this.webhookHash = config.getOrThrow<string>('FLUTTERWAVE_WEBHOOK_HASH');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
    return (await response.json()) as T;
  }

  async initiate(
    params: InitiatePaymentParams,
  ): Promise<InitiatePaymentResult> {
    const txRef = `${params.orderNumber}-${randomBytes(4).toString('hex')}`;
    const result = await this.request<FlutterwaveInitializeResponse>(
      '/payments',
      {
        method: 'POST',
        body: JSON.stringify({
          tx_ref: txRef,
          amount: params.amount,
          currency: params.currency.toUpperCase(),
          redirect_url: params.successUrl,
          customer: { email: params.customerEmail },
          meta: { orderId: params.orderId },
          // Vendor payouts epic (docs/ROADMAP.md FDP-53) — mirrors PaystackAdapter.initiate's
          // split, but Flutterwave's shape is a `subaccounts` array rather than a single
          // `subaccount` field, and its "flat_subaccount" charge type is the inverse of
          // Paystack's `transaction_charge`: here `transaction_charge` is the flat amount the
          // *subaccount* (restaurant) receives, with the platform automatically keeping
          // whatever's left — confirmed against Flutterwave's split-payments docs, since this
          // codebase had no prior reference for the field's direction and getting it backwards
          // would misroute real money. No ×100 — unlike Paystack (kobo), Flutterwave's `amount`
          // (and therefore `transaction_charge`) is already in the currency's major unit, same
          // as everywhere else in this adapter.
          ...(params.restaurantPayoutAccountReference &&
          params.restaurantPayoutAmount != null
            ? {
                subaccounts: [
                  {
                    id: params.restaurantPayoutAccountReference,
                    transaction_charge_type: 'flat_subaccount',
                    transaction_charge: params.restaurantPayoutAmount,
                  },
                ],
              }
            : {}),
        }),
      },
    );

    if (result.status !== 'success' || !result.data) {
      throw new Error(
        result.message ?? 'Flutterwave payment initialize failed',
      );
    }
    return { redirectUrl: result.data.link, reference: txRef };
  }

  async verify(reference: string): Promise<VerifyPaymentResult> {
    const result = await this.request<FlutterwaveVerifyResponse>(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
    );
    return {
      success:
        result.status === 'success' && result.data?.status === 'successful',
      reference,
    };
  }

  // A constant-time string comparison, no network call — no `await` needed.
  handleWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<WebhookEvent | null> {
    if (!signature) return Promise.resolve(null);

    const expectedBuf = Buffer.from(this.webhookHash, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');
    if (
      expectedBuf.length !== signatureBuf.length ||
      !timingSafeEqual(expectedBuf, signatureBuf)
    ) {
      return Promise.resolve(null);
    }

    const payload = JSON.parse(
      rawBody.toString('utf8'),
    ) as FlutterwaveWebhookPayload;
    return Promise.resolve({
      reference: payload.data.tx_ref,
      success: payload.data.status === 'successful',
    });
  }

  async refund(paymentRef: string): Promise<void> {
    const verification = await this.request<FlutterwaveVerifyResponse>(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(paymentRef)}`,
    );
    if (!verification.data) return;
    await this.request(`/transactions/${verification.data.id}/refund`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // --- Vendor payouts epic, part 3 of 4 (docs/ROADMAP.md FDP-53) ---
  // Same subaccount-and-split pattern as PaystackAdapter (FDP-52): a restaurant picks their
  // bank + enters an account number, we resolve it to a name for them to confirm, then create a
  // subaccount. None of this is part of the shared PaymentAdapter interface — Stripe Connect
  // (FDP-54) has its own, differently-shaped onboarding.

  /** NGN banks only for now, same scope as Paystack's listBanks — this project's primary
   * currency. Unlike Paystack, no test-mode workaround is needed here: nothing in this
   * codebase or Flutterwave's docs indicates a comparable daily cap on account resolution. */
  async listBanks(): Promise<FlutterwaveBank[]> {
    const result =
      await this.request<FlutterwaveListBanksResponse>('/banks/NG');
    if (result.status !== 'success' || !result.data) {
      throw new Error(result.message ?? 'Could not load the bank list');
    }
    return result.data.map((bank) => ({ name: bank.name, code: bank.code }));
  }

  /** Confirms an account number actually belongs to the name the restaurant expects, before we
   * ever create a subaccount against it — same reasoning as Paystack's resolveAccount. */
  async resolveAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<{ accountNumber: string; accountName: string }> {
    const result = await this.request<FlutterwaveResolveAccountResponse>(
      '/accounts/resolve',
      {
        method: 'POST',
        body: JSON.stringify({
          account_number: accountNumber,
          account_bank: bankCode,
        }),
      },
    );
    if (result.status !== 'success' || !result.data) {
      throw new Error(result.message ?? "Couldn't verify that account number");
    }
    return {
      accountNumber: result.data.account_number,
      accountName: result.data.account_name,
    };
  }

  /**
   * `splitValue` is a fraction (0-1), not a 0-100 percentage like Paystack's
   * `percentageCharge` — confirmed live against the Flutterwave sandbox (a 0.15 `split_value`
   * with `split_type: 'percentage'` was accepted and echoed back unchanged). Like Paystack, this
   * is only the subaccount's stored default; every real transaction (see `initiate()` above)
   * overrides it with an exact `transaction_charge` computed from that specific order's numbers.
   * `businessEmail` is required by Flutterwave's subaccount API — there's no restaurant-level
   * email in this schema, so callers pass the owning user's account email. No separate transfer
   * call is needed for this provider: Flutterwave settles both sides of the split directly.
   */
  async createSubaccount(params: {
    businessName: string;
    businessEmail: string;
    bankCode: string;
    accountNumber: string;
    splitValue: number;
  }): Promise<{ subaccountId: string }> {
    const result = await this.request<FlutterwaveCreateSubaccountResponse>(
      '/subaccounts',
      {
        method: 'POST',
        body: JSON.stringify({
          account_bank: params.bankCode,
          account_number: params.accountNumber,
          business_name: params.businessName,
          business_email: params.businessEmail,
          country: 'NG',
          split_type: 'percentage',
          split_value: params.splitValue,
        }),
      },
    );
    if (result.status !== 'success' || !result.data) {
      throw new Error(
        result.message ?? 'Could not create the payout subaccount',
      );
    }
    return { subaccountId: result.data.subaccount_id };
  }
}
