// Common interface every provider adapter implements (docs/ARCHITECTURE.md §4) — checkout/
// webhook code never branches on provider name outside PaymentsService's small adapter
// registry and these three implementations.

export interface InitiatePaymentParams {
  orderId: string;
  orderNumber: string;
  /** Major currency unit (e.g. 15.5 for NGN 15.50) — each adapter converts to whatever unit its
   * provider's API expects. */
  amount: number;
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  // No vendor-split fields here (removed docs/ROADMAP.md FDP-95) — every charge settles in full
  // to the platform's own account; a vendor's cut is paid out separately by the weekly batch
  // (docs/ARCHITECTURE.md §19), straight into whichever payout account they've onboarded. See
  // §14 for why this replaced the original instant charge-time provider split.
}

export interface InitiatePaymentResult {
  /** Where the browser is sent to complete payment on the provider's hosted page. */
  redirectUrl: string;
  /** The provider's own transaction reference — stored as `Order.paymentRef`. */
  reference: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  reference: string;
}

export interface WebhookEvent {
  reference: string;
  success: boolean;
}

export interface PaymentAdapter {
  initiate(params: InitiatePaymentParams): Promise<InitiatePaymentResult>;
  verify(reference: string): Promise<VerifyPaymentResult>;
  /** Returns `null` for an invalid signature or an event this adapter doesn't act on — callers
   * must treat `null` as "do nothing", never as a failure to surface to the provider (webhook
   * senders retry on non-2xx, so unrecognized-but-harmless events still return 2xx). */
  handleWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<WebhookEvent | null>;
  refund(paymentRef: string): Promise<void>;
}
