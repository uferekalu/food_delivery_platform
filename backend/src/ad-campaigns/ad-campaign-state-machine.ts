import type { AdCampaignStatus } from './schemas/ad-campaign.schema';

/**
 * Full lifecycle graph (docs/ARCHITECTURE.md §46), same graph-as-data pattern as
 * order-state-machine.ts's ORDER_TRANSITIONS.
 *
 * - `pending_payment` -> `scheduled`: payment succeeds and `startDate` is still in the future.
 * - `pending_payment` -> `active`: payment succeeds and `startDate` has already arrived (a
 *   same-day campaign) — the vendor doesn't wait for tomorrow's cron sweep just because they
 *   paid today for a campaign starting today.
 * - `pending_payment` -> `cancelled`: admin cancels before any payment — nothing charged yet.
 * - `scheduled` -> `active`: the lifecycle sweep, once `startDate` arrives.
 * - `scheduled` -> `cancelled`: admin cancels after payment but before it goes live.
 * - `active` -> `ended`: the lifecycle sweep, once `endDate` passes. There is deliberately no
 *   `active` -> `cancelled` edge — a paid, live campaign always runs to its natural end date
 *   (confirmed decision: no early cancellation of an already-active campaign).
 * - `ended`/`cancelled` are terminal.
 *
 * There is no `payment_failed` node — a failed charge attempt only ever touches the separate
 * `paymentStatus` field (see AdCampaign schema), never this graph, so a retry is just "call
 * initiateCampaignPayment again while still `pending_payment`".
 */
export const AD_CAMPAIGN_TRANSITIONS: Record<
  AdCampaignStatus,
  AdCampaignStatus[]
> = {
  pending_payment: ['scheduled', 'active', 'cancelled'],
  scheduled: ['active', 'cancelled'],
  active: ['ended'],
  ended: [],
  cancelled: [],
};

export function canTransition(
  from: AdCampaignStatus,
  to: AdCampaignStatus,
): boolean {
  return AD_CAMPAIGN_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: AdCampaignStatus): boolean {
  return AD_CAMPAIGN_TRANSITIONS[status].length === 0;
}
