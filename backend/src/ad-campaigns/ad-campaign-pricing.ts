// Sponsored-listing pricing — a config table, not hardcoded branching, mirroring
// PaymentProviderResolver's CURRENCY_PROVIDER_TABLE shape exactly (docs/ARCHITECTURE.md §4): a
// new currency's rate is a table edit here, not a code change anywhere else. These are launch
// placeholders, not real negotiated business rates — an admin can always override the computed
// total per campaign (CreateAdCampaignDto.totalPriceOverride), so shipping isn't blocked on
// having exact real-world numbers, but they should be sanity-checked before any vendor is
// actually charged one of these amounts for real.
const AD_CAMPAIGN_DAILY_RATE_TABLE: Record<string, number> = {
  NGN: 5000,
  GHS: 120,
  KES: 800,
  ZAR: 150,
  UGX: 40000,
};

const GLOBAL_DEFAULT_DAILY_RATE = 15;

export function resolveDailyRate(currency: string): number {
  return (
    AD_CAMPAIGN_DAILY_RATE_TABLE[currency.toUpperCase()] ??
    GLOBAL_DEFAULT_DAILY_RATE
  );
}

export function computeSuggestedTotal(
  currency: string,
  durationDays: number,
): number {
  return resolveDailyRate(currency) * durationDays;
}
