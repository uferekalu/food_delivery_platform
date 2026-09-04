/**
 * Formats a monetary amount for a server-generated message (notification body, email subject)
 * where there's no per-recipient locale to read (`User` has no stored locale preference) — always
 * formats in `en`. Mirrors `frontend/src/lib/currency.ts`'s `formatMoney`; keep the two in sync.
 */
export function formatMoney(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}
