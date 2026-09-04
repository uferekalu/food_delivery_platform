/**
 * Formats a monetary amount in a specific ISO 4217 currency (e.g. "₦1,000.00", "$1,000.00") —
 * every price/total/fee in this app is denominated in whatever currency its own restaurant/
 * store/order uses (docs/ARCHITECTURE.md §4), never a single platform-wide one, so the currency
 * code always travels with the amount rather than being assumed. `locale` controls grouping/
 * decimal-separator conventions (and which symbol variant CLDR prefers); `currencyCode` controls
 * the actual currency — this is the standard `Intl` pairing for "format this transaction, viewed
 * by this person."
 */
export function formatMoney(amount: number, currencyCode: string | null | undefined, locale: string): string {
  if (!currencyCode) return amount.toFixed(2);
  try {
    // `currencyDisplay: "narrowSymbol"` (not the default "symbol") deliberately — CLDR's default
    // symbol for a currency unfamiliar to the viewer's own locale is often just the ISO code
    // (e.g. en-US formats NGN as "NGN 1,000.00", not "₦1,000.00", since Naira isn't a currency
    // that locale's data considers "home"). A price is always shown next to its own restaurant/
    // store's currency, never compared side by side with a same-symbol currency from another
    // country, so the narrow (shortest recognizable) symbol is unambiguous here.
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    // An invalid/unrecognized ISO code — shouldn't happen given the app's own currency picker
    // (`getLocalizedCurrencyOptions`), but a real amount must still render clearly rather than
    // throw and blank the page.
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

/** Plain grouped-number formatting with no currency attached — for the rare amount that has no
 * currency to show correctly (e.g. a platform-wide fixed-amount promo code with no single
 * restaurant/store to derive one from). Still gives real thousands separators instead of a bare
 * unformatted number; just doesn't fabricate a currency symbol that could be wrong. */
export function formatNumber(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(amount);
}

/** The bare currency symbol/short form for a code (e.g. "₦" for NGN, "$" for USD) — used by
 * `MoneyInput` as a field adornment where a full formatted amount would be wrong (the user is
 * mid-typing, not looking at a finished number). Falls back to the code itself if `Intl` can't
 * resolve a narrower symbol for it. */
export function currencySymbol(currencyCode: string | null | undefined, locale: string): string {
  if (!currencyCode) return "";
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currencyCode;
  } catch {
    return currencyCode;
  }
}
