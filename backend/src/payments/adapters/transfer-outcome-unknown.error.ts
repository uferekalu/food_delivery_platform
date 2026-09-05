/**
 * Weekly payout execution (docs/ROADMAP.md FDP-92) — thrown by an adapter's `transfer()` method
 * specifically when the outcome of a real money-movement call could not be determined: the
 * request may or may not have reached the provider, or a response may or may not have been
 * received, so the transfer might have actually succeeded even though this call is reporting
 * failure. This is categorically different from a confirmed provider-side rejection (bad
 * recipient, insufficient balance, etc., which the provider clearly reports as `status: false`)
 * — the caller (PayoutExecutionService) must never auto-retry or release the claimed orders back
 * to the unpaid pool on this error, since either could double-pay the vendor/rider. Instead it
 * leaves the payout attempt's orders claimed, flags the Payout document for manual admin
 * reconciliation, and raises an urgent admin notification — "no loopholes" per the platform's
 * payout-system requirement means an uncertain outcome always surfaces to a human immediately,
 * never resolves itself silently in either direction.
 */
export class TransferOutcomeUnknownError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TransferOutcomeUnknownError';
  }
}
