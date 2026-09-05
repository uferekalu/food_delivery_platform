import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type {
  InitiatePaymentParams,
  InitiatePaymentResult,
  PaymentAdapter,
  VerifyPaymentResult,
  WebhookEvent,
} from './payment-adapter.interface';
import { TransferOutcomeUnknownError } from './transfer-outcome-unknown.error';

const BASE_URL = 'https://api.paystack.co';

interface PaystackInitializeResponse {
  status: boolean;
  data?: { authorization_url: string; reference: string };
  message?: string;
}

interface PaystackVerifyResponse {
  status: boolean;
  data?: { status: string; reference: string };
}

interface PaystackRefundResponse {
  status: boolean;
  message?: string;
}

interface PaystackWebhookPayload {
  event: string;
  data: { reference: string; status: string };
}

export interface PaystackBank {
  name: string;
  code: string;
}

interface PaystackListBanksResponse {
  status: boolean;
  data?: PaystackBank[];
  message?: string;
}

interface PaystackResolveAccountResponse {
  status: boolean;
  data?: { account_number: string; account_name: string };
  message?: string;
}

interface PaystackCreateSubaccountResponse {
  status: boolean;
  data?: { subaccount_code: string };
  message?: string;
}

interface PaystackCreateRecipientResponse {
  status: boolean;
  data?: { recipient_code: string };
  message?: string;
}

interface PaystackTransferResponse {
  status: boolean;
  data?: { transfer_code: string; reference: string };
  message?: string;
}

// Paystack's "Standard" hosted checkout — see stripe.adapter.ts for why a hosted redirect over
// an embedded form. Primarily the NGN leg of docs/ARCHITECTURE.md §4's routing table; amounts
// are converted to kobo (Paystack's minor unit, ×100) below.
@Injectable()
export class PaystackAdapter implements PaymentAdapter {
  private readonly secretKey: string;

  constructor(config: ConfigService) {
    this.secretKey = config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
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
    const reference = `${params.orderNumber}-${randomBytes(4).toString('hex')}`;
    const result = await this.request<PaystackInitializeResponse>(
      '/transaction/initialize',
      {
        method: 'POST',
        body: JSON.stringify({
          email: params.customerEmail,
          amount: Math.round(params.amount * 100),
          currency: params.currency.toUpperCase(),
          reference,
          callback_url: params.successUrl,
          metadata: { orderId: params.orderId },
          // Vendor payouts epic (docs/ROADMAP.md FDP-52) — `subaccount` tells Paystack to split
          // this transaction's settlement with the restaurant's account. `transaction_charge`
          // (a flat amount in the same minor unit as `amount`, going to the *platform's* main
          // account — mirrors percentage_charge's "what the platform keeps" framing) overrides
          // the subaccount's own stored percentage for this specific transaction, since the
          // right split isn't a fixed percentage of the whole order total — see
          // InitiatePaymentParams.restaurantPayoutAmount's doc comment for why. `bearer:
          // 'account'` keeps Paystack's own processing fee on the platform, never deducted from
          // what the restaurant receives.
          ...(params.restaurantPayoutAccountReference &&
          params.restaurantPayoutAmount != null
            ? {
                subaccount: params.restaurantPayoutAccountReference,
                transaction_charge: Math.round(
                  (params.amount - params.restaurantPayoutAmount) * 100,
                ),
                bearer: 'account',
              }
            : {}),
        }),
      },
    );

    if (!result.status || !result.data) {
      throw new Error(
        result.message ?? 'Paystack transaction initialize failed',
      );
    }
    return {
      redirectUrl: result.data.authorization_url,
      reference: result.data.reference,
    };
  }

  async verify(reference: string): Promise<VerifyPaymentResult> {
    const result = await this.request<PaystackVerifyResponse>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    return {
      success: result.status && result.data?.status === 'success',
      reference,
    };
  }

  // Pure local crypto (HMAC of the raw body), no network call — no `await` needed.
  handleWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<WebhookEvent | null> {
    if (!signature) return Promise.resolve(null);

    const expected = createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');
    if (
      expectedBuf.length !== signatureBuf.length ||
      !timingSafeEqual(expectedBuf, signatureBuf)
    ) {
      return Promise.resolve(null);
    }

    const payload = JSON.parse(
      rawBody.toString('utf8'),
    ) as PaystackWebhookPayload;
    if (payload.event !== 'charge.success') return Promise.resolve(null);
    return Promise.resolve({
      reference: payload.data.reference,
      success: payload.data.status === 'success',
    });
  }

  async refund(paymentRef: string): Promise<void> {
    // Unlike every other method in this file, this used to discard the response entirely — a
    // rejected refund (e.g. Paystack returning 200 { status: false, message: 'Insufficient
    // balance in main account' }) was silently treated as success, letting
    // PaymentsService.refundOrder mark the order REFUNDED (terminal) with no money actually
    // returned (docs/ROADMAP.md FDP-65).
    const result = await this.request<PaystackRefundResponse>('/refund', {
      method: 'POST',
      body: JSON.stringify({ transaction: paymentRef }),
    });
    if (!result.status) {
      throw new Error(result.message ?? 'Paystack refund failed');
    }
  }

  // --- Vendor payouts epic, part 2 of 4 (docs/ROADMAP.md FDP-52) ---
  // Paystack-specific onboarding: a restaurant picks their bank + enters an account number, we
  // resolve it to a name for them to confirm (catches typos before money is on the line), then
  // create a subaccount. None of this is part of the shared PaymentAdapter interface — Flutterwave
  // (FDP-53) and Stripe Connect (FDP-54) each have their own, differently-shaped onboarding.

  /** NGN banks only for now — this project's primary currency; broadened if/when a non-NGN
   * Paystack corridor actually needs it. Appends Paystack's own "Test Bank" (code `001`) when
   * running against a test-mode secret key — Paystack caps *real* bank-account resolution at 3
   * per day in test mode (hit live, 2026-09-01: a resolve attempt against a real bank returned
   * "Test mode daily limit of 3 live bank resolves exceeded"), and `001` is Paystack's documented
   * escape hatch for exercising this flow beyond that cap. It doesn't appear in the real `/bank`
   * list, and never appears at all once this runs on a live key (business_name/currency won't
   * accept it in production, so there's no reason to offer it there). */
  async listBanks(): Promise<PaystackBank[]> {
    const result = await this.request<PaystackListBanksResponse>(
      '/bank?country=nigeria&currency=NGN&perPage=100',
    );
    if (!result.status || !result.data) {
      throw new Error(result.message ?? 'Could not load the bank list');
    }
    if (this.secretKey.startsWith('sk_test_')) {
      return [
        ...result.data,
        {
          name: 'Test Bank (sandbox only — bypasses the 3/day resolve limit)',
          code: '001',
        },
      ];
    }
    return result.data;
  }

  /** Confirms an account number actually belongs to the name the restaurant expects, before we
   * ever create a subaccount against it — the single most valuable fraud/typo guard available
   * here, and Paystack does the lookup, we never see raw bank credentials beyond the account
   * number itself. */
  async resolveAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<{ accountNumber: string; accountName: string }> {
    const result = await this.request<PaystackResolveAccountResponse>(
      `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    );
    if (!result.status || !result.data) {
      throw new Error(result.message ?? "Couldn't verify that account number");
    }
    return {
      accountNumber: result.data.account_number,
      accountName: result.data.account_name,
    };
  }

  /**
   * `percentageCharge` is what the *platform* (the main account) keeps — Paystack's own naming
   * is from the main account's perspective, easy to get backwards. This is only the subaccount's
   * *stored default*; every real transaction (see `initiate()` above) overrides it with an
   * exact `transaction_charge` computed from that specific order's numbers, since a flat
   * percentage of the whole order total would be wrong (it includes the delivery fee and
   * service fee, neither of which belongs to the restaurant) — Paystack still requires some
   * percentage at creation time, so this is set to the platform's commission rate as a sane
   * fallback that's never actually relied on. No separate transfer call from this codebase is
   * needed for this provider: Paystack settles both sides of the split directly.
   */
  async createSubaccount(params: {
    businessName: string;
    bankCode: string;
    accountNumber: string;
    percentageCharge: number;
  }): Promise<{ subaccountCode: string }> {
    const result = await this.request<PaystackCreateSubaccountResponse>(
      '/subaccount',
      {
        method: 'POST',
        body: JSON.stringify({
          business_name: params.businessName,
          settlement_bank: params.bankCode,
          account_number: params.accountNumber,
          percentage_charge: params.percentageCharge,
        }),
      },
    );
    if (!result.status || !result.data) {
      throw new Error(
        result.message ?? 'Could not create the payout subaccount',
      );
    }
    return { subaccountCode: result.data.subaccount_code };
  }

  // --- Weekly payout execution (docs/ROADMAP.md FDP-92) ---

  /**
   * Pays a restaurant/store's own subaccount directly (`type: 'subaccount'` recipient) — unlike
   * Flutterwave, Paystack's Transfers API can target a subaccount without re-supplying bank
   * details, so `PayoutAccount.bankCode`/`accountNumber` aren't needed here. A fresh recipient is
   * created on every call rather than cached: Paystack accepts repeat recipient creation for the
   * same subaccount without complaint (confirmed against its docs), and this only runs weekly, so
   * there's no hot-path cost to avoid.
   *
   * Operational prerequisite, not something this code can satisfy: Paystack transfers require
   * either OTP finalization (`POST /transfer/finalize_transfer`, needs a human with a one-time
   * code) or "Disable OTP" turned on for the account in the Paystack dashboard. This platform's
   * live Paystack account must have OTP disabled for transfers, or every weekly batch's Paystack
   * leg will come back rejected (see docs/ARCHITECTURE.md §14).
   *
   * A thrown network-layer error (the request never got a response) is reported as
   * `TransferOutcomeUnknownError` — the money may or may not have moved — never as a plain
   * `Error`, which the caller would treat as a confirmed, safe-to-retry rejection.
   */
  async transfer(params: {
    subaccountReference: string;
    amount: number;
    currency: string;
    reference: string;
    reason: string;
  }): Promise<{ transferReference: string }> {
    let recipient: PaystackCreateRecipientResponse;
    try {
      recipient = await this.request<PaystackCreateRecipientResponse>(
        '/transferrecipient',
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'subaccount',
            subaccount: params.subaccountReference,
            currency: params.currency.toUpperCase(),
          }),
        },
      );
    } catch (error) {
      throw new TransferOutcomeUnknownError(
        `Paystack transfer-recipient creation outcome unknown: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
    if (!recipient.status || !recipient.data) {
      // A clean, confirmed rejection — the transfer itself was never even attempted, so no money
      // could possibly have moved.
      throw new Error(
        recipient.message ?? 'Could not create the Paystack transfer recipient',
      );
    }

    let transfer: PaystackTransferResponse;
    try {
      transfer = await this.request<PaystackTransferResponse>('/transfer', {
        method: 'POST',
        body: JSON.stringify({
          source: 'balance',
          amount: Math.round(params.amount * 100),
          recipient: recipient.data.recipient_code,
          reason: params.reason,
          reference: params.reference,
          currency: params.currency.toUpperCase(),
        }),
      });
    } catch (error) {
      throw new TransferOutcomeUnknownError(
        `Paystack transfer outcome unknown: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
    if (!transfer.status || !transfer.data) {
      throw new Error(transfer.message ?? 'Paystack transfer failed');
    }
    return { transferReference: transfer.data.transfer_code };
  }
}
