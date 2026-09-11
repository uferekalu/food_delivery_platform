import { computeSuggestedTotal, resolveDailyRate } from './ad-campaign-pricing';

describe('ad-campaign-pricing', () => {
  it('resolveDailyRate returns the table rate for a listed currency', () => {
    expect(resolveDailyRate('NGN')).toBe(5000);
    expect(resolveDailyRate('ngn')).toBe(5000); // case-insensitive, matches CURRENCY_PROVIDER_TABLE's convention
  });

  it('resolveDailyRate falls back to the global default for an unlisted currency', () => {
    expect(resolveDailyRate('XYZ')).toBe(15);
  });

  it('computeSuggestedTotal multiplies the daily rate by duration', () => {
    expect(computeSuggestedTotal('NGN', 7)).toBe(35000);
    expect(computeSuggestedTotal('XYZ', 3)).toBe(45);
  });
});
