/**
 * Refund-hardening pass (docs/ROADMAP.md FDP-104) — the refund-side twin of
 * `TransferOutcomeUnknownError`. Thrown by an adapter's `refund()` method specifically when a
 * network-layer failure (no response received, connection error) means the reversal may or may
 * not have actually happened at the provider — categorically different from a confirmed
 * provider-side rejection (already refunded, insufficient balance, etc., which the provider
 * clearly reports as a JSON `status: false`/similar). The caller (`PaymentsService.refundOrder`)
 * must never revert the order back to "refundable" on this error the way it does for a confirmed
 * rejection — the customer may already have their money back, and blindly allowing a retry risks
 * a second real refund attempt. Instead it flags the order for manual admin reconciliation and
 * blocks further automatic retries until a human resolves it — the same "no loopholes" posture
 * the payout system's `TransferOutcomeUnknownError` already established.
 */
export class RefundOutcomeUnknownError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RefundOutcomeUnknownError';
  }
}
