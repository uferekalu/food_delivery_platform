// A payout's `failureReason` is whatever raw string the payment provider returned
// (docs/ROADMAP.md FDP-105) — accurate, but too technical for either an admin trying to guide a
// vendor or the vendor themselves. Classifies a handful of common, recognizable failure shapes so
// the UI can show a plain-language explanation alongside the raw reason, rather than instead of
// it — the raw string stays visible for anyone who needs the technical detail.
export type PayoutFailureCategory =
  | "missingBankDetails"
  | "insufficientBalance"
  | "invalidAccount"
  | "otpRequired"
  | "unknown";

export function classifyPayoutFailure(
  reason: string | null | undefined,
): PayoutFailureCategory {
  if (!reason) return "unknown";
  const r = reason.toLowerCase();
  if (
    r.includes("authorization_code") ||
    r.includes("account_number") ||
    r.includes("bank_code")
  ) {
    return "missingBankDetails";
  }
  if (r.includes("insufficient balance")) return "insufficientBalance";
  if (r.includes("invalid") && r.includes("account")) return "invalidAccount";
  if (r.includes("otp") || r.includes("finalize")) return "otpRequired";
  return "unknown";
}
