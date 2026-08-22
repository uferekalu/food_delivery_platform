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
}
