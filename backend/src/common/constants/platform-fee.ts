/**
 * Vendor payouts epic (docs/ROADMAP.md FDP-51 onward) — the platform's commission on a
 * restaurant's food subtotal, shared by OrdersService (which snapshots it onto every order as
 * platformFeeAmount/restaurantPayoutAmount at creation time) and every payout-onboarding flow
 * that needs to configure a provider's split account with the same figure. A single source so
 * the two can never silently drift apart.
 */
export const PLATFORM_COMMISSION_RATE = 0.15;
