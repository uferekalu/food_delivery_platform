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
  /**
   * Vendor payouts epic (docs/ROADMAP.md FDP-52 onward) — the restaurant's active payout-account
   * reference for *this* provider (Paystack `subaccount_code`, Flutterwave subaccount id, a
   * Stripe connected account id), if one exists. An adapter that doesn't support automated
   * splits yet (or when this is unset, meaning the restaurant hasn't onboarded one) just ignores
   * it — the full amount settles to the platform's own account, per Restaurant.payoutAccounts'
   * doc comment.
   */
  restaurantPayoutAccountReference?: string;
  /**
   * The exact amount (major currency unit, same as `amount`) owed to the restaurant for *this*
   * order — Order.restaurantPayoutAmount, i.e. the food subtotal minus the platform's
   * commission. Deliberately NOT `amount * (1 - commissionRate)`: `amount` is the order total,
   * which also includes the delivery fee (owed to the rider, a separate concern this split
   * doesn't touch) and the service fee (the platform's own revenue) — splitting on the whole
   * total would hand the restaurant a cut of both by mistake. An adapter that supports splits
   * uses this to compute exactly how much of the charge should go to the platform vs. the
   * restaurant's account, so the restaurant receives precisely this amount and the platform's
   * main account receives everything else (its commission + the delivery fee + the service fee).
   */
  restaurantPayoutAmount?: number;
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
