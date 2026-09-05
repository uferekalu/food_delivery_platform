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
import { TransferOutcomeUnknownError } from './transfer-outcome-unknown.error';

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
  // Optional, not required — this is untrusted external input parsed via a bare `as` cast, and
  // handleWebhook must not assume the network actually sent this shape (docs/ROADMAP.md FDP-65).
  data?: { id: number; status: string; tx_ref: string };
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

interface FlutterwaveRefundResponse {
  status: string;
  message?: string;
}

interface FlutterwaveTransferResponse {
  status: string;
  data?: { id: number; reference: string };
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
          // No subaccounts split here (removed docs/ROADMAP.md FDP-95) — the full amount
          // settles to the platform's own account; see `transfer()` below for how a vendor's cut
          // actually reaches them now (a separate, later transfer driven by the weekly batch).
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

    // docs/ROADMAP.md FDP-65 — two real gaps found in the same audit pass, both fixed here:
    // (1) unlike Stripe (`event.type !== 'checkout.session.completed'`) and Paystack
    // (`payload.event !== 'charge.success'`), this never checked `event` at all, so *any*
    // correctly-signed webhook whose body happens to contain a `data.tx_ref`/`data.status` shape
    // — a non-charge event type, or an unexpected retry — was processed as an authoritative
    // charge result. (2) a malformed/unexpected body (e.g. missing `data`) threw an uncaught
    // TypeError all the way up through PaymentsController's webhook route, surfacing as a raw
    // 500 that could trip Flutterwave's own retry/auto-disable logic — the interface's own doc
    // comment says this method returns `null` for "an event this adapter doesn't act on", never
    // throws.
    let payload: FlutterwaveWebhookPayload;
    try {
      payload = JSON.parse(
        rawBody.toString('utf8'),
      ) as FlutterwaveWebhookPayload;
    } catch {
      return Promise.resolve(null);
    }
    if (payload.event !== 'charge.completed' || !payload.data) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      reference: payload.data.tx_ref,
      success: payload.data.status === 'successful',
    });
  }

  async refund(paymentRef: string): Promise<void> {
    const verification = await this.request<FlutterwaveVerifyResponse>(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(paymentRef)}`,
    );
    if (verification.status !== 'success' || !verification.data) {
      // Previously a silent `return` — treated as success even though nothing was found to
      // refund (docs/ROADMAP.md FDP-65), e.g. a transient verify_by_reference propagation delay.
      throw new Error(
        'Could not find the original Flutterwave transaction to refund',
      );
    }
    const result = await this.request<FlutterwaveRefundResponse>(
      `/transactions/${verification.data.id}/refund`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    if (result.status !== 'success') {
      // Previously unchecked entirely — a provider-side rejection here (e.g. already refunded,
      // insufficient balance) was indistinguishable from success.
      throw new Error(result.message ?? 'Flutterwave refund failed');
    }
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

  // --- Weekly payout execution (docs/ROADMAP.md FDP-92) ---

  /**
   * A standalone bank transfer, not a subaccount payout — Flutterwave's Transfers API has no
   * "pay this subaccount" call the way Paystack's does, only `account_bank`/`account_number`
   * (`PayoutAccount.bankCode`/`accountNumber`, persisted at onboarding time since FDP-92; a
   * payout account onboarded before this field existed has to be re-onboarded before it can
   * receive a real transfer — same one-time gap `docs/ARCHITECTURE.md` §14 calls out).
   * Flutterwave's initial response only confirms the transfer was *queued*, not that it settled
   * (final status arrives async, via `GET /transfers/:id` or a transfer webhook this codebase
   * doesn't yet consume) — same best-effort synchronous-response posture as `initiate()`/`verify()`
   * elsewhere in this adapter, not a gap unique to payouts.
   */
  async transfer(params: {
    bankCode: string;
    accountNumber: string;
    amount: number;
    currency: string;
    reference: string;
    narration: string;
  }): Promise<{ transferReference: string }> {
    let result: FlutterwaveTransferResponse;
    try {
      result = await this.request<FlutterwaveTransferResponse>('/transfers', {
        method: 'POST',
        body: JSON.stringify({
          account_bank: params.bankCode,
          account_number: params.accountNumber,
          amount: params.amount,
          currency: params.currency.toUpperCase(),
          narration: params.narration,
          reference: params.reference,
        }),
      });
    } catch (error) {
      throw new TransferOutcomeUnknownError(
        `Flutterwave transfer outcome unknown: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
    if (result.status !== 'success' || !result.data) {
      throw new Error(result.message ?? 'Flutterwave transfer failed');
    }
    return { transferReference: String(result.data.id) };
  }
}
