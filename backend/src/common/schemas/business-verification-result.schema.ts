import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export const BUSINESS_VERIFICATION_STATUSES = [
  'not_attempted',
  'verified',
  'mismatch',
] as const;
export type BusinessVerificationStatus =
  (typeof BUSINESS_VERIFICATION_STATUSES)[number];

/**
 * Result of the automated business-registration check (docs/ROADMAP.md FDP-115) — run against
 * Youverify's CAC/RC lookup right after a restaurant/store is created. Shared between
 * `Restaurant` and `Store` (same "move to common/ once a second domain needs it" pattern as
 * `PayoutAccount`/`Address`). Deliberately independent of `isApproved`: this is what the
 * *provider* said, `isApproved` is what actually gates marketplace visibility — see
 * `RestaurantsService.autoApproveIfEligible` for the one place a `verified` result can flip
 * `isApproved` (only once the other existing approval prerequisite — at least one menu item /
 * product — is also met).
 *
 * `status`:
 * - `not_attempted` — the default. Covers both "Youverify was never configured" and "the
 *   lookup threw/timed out/returned something unparseable" — both cases must behave identically
 *   for gating (fall back to the existing manual admin queue), so they share one status value.
 *   `failureReason` still distinguishes them for ops debugging.
 * - `verified` — Youverify confirmed the registration number resolves to a registered business
 *   whose name loosely matches what the vendor entered.
 * - `mismatch` — Youverify responded, but the number wasn't found or the registered name didn't
 *   match — a confirmed negative result (not a throw), falls back to the manual queue exactly
 *   like `not_attempted`, but with an explicit reason an admin can see.
 */
@Schema({ _id: false })
export class BusinessVerificationResult {
  @Prop({
    type: String,
    enum: BUSINESS_VERIFICATION_STATUSES,
    default: 'not_attempted',
  })
  status: BusinessVerificationStatus;

  @Prop({ type: String, default: null })
  providerRegisteredName: string | null;

  // Reference only — never gates anything (confirmed decision: free-text address matching is
  // unreliable). Shown to admin alongside the vendor's own entered address for a human to compare.
  @Prop({ type: String, default: null })
  providerRegisteredAddress: string | null;

  // Youverify's own registry status string verbatim (e.g. "active"), not this platform's enum.
  @Prop({ type: String, default: null })
  providerRawStatus: string | null;

  @Prop({ type: Date, default: null })
  checkedAt: Date | null;

  // Mismatch reason, or the network/HTTP error text — for admin/ops visibility only.
  @Prop({ type: String, default: null })
  failureReason: string | null;
}

export const BusinessVerificationResultSchema = SchemaFactory.createForClass(
  BusinessVerificationResult,
);
