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

interface PaystackWebhookPayload {
  event: string;
  data: { reference: string; status: string };
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
    await this.request('/refund', {
      method: 'POST',
      body: JSON.stringify({ transaction: paymentRef }),
    });
  }
}
