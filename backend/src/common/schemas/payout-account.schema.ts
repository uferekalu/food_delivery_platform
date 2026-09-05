import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { PAYMENT_PROVIDERS } from '../../payments/payment-provider';
import type { PaymentProvider } from '../../payments/payment-provider';

export const PAYOUT_ACCOUNT_STATUSES = ['pending', 'active'] as const;
export type PayoutAccountStatus = (typeof PAYOUT_ACCOUNT_STATUSES)[number];

/**
 * Vendor payouts epic, part 1 of 4 (docs/ROADMAP.md FDP-51) — one entry per provider a
 * restaurant/store/rider has (or hasn't yet) onboarded a payout-capable account with. Moved to
 * `common/` in FDP-91 once `Store` and `Rider` needed their own `payoutAccounts` array too,
 * same "move once a second domain needs it" pattern as `Address`/`OpeningHour`. A vendor can
 * need more than one entry: `InitiatePaymentDto.provider` lets a customer override the
 * currency's default provider per order, so payout coverage has to mirror the same
 * multi-provider reality `PaymentProviderResolver` already models, not just the default
 * provider.
 *
 * `reference` is the provider's own subaccount/connected-account/transfer-recipient identifier
 * (Paystack `subaccount_code`, Flutterwave subaccount id, Stripe connected account id) — always
 * `null` with `status: 'pending'` until a real onboarding flow (FDP-52/53/54 for restaurants)
 * actually creates one. Until a provider has an `active` entry here, that provider's orders for
 * this vendor settle to the platform's own account, not the vendor's.
 *
 * `bankCode`/`accountNumber` (FDP-92) are populated for Paystack/Flutterwave alongside
 * `reference` at onboarding time — already resolved once via each adapter's `resolveAccount`
 * before the subaccount was created, just not previously persisted. Needed for real payout
 * execution: Flutterwave's Transfers API has no "pay this subaccount" call, only a standalone
 * bank transfer (`account_bank`/`account_number`), so the raw bank details have to be on hand.
 * Paystack *can* transfer straight to a subaccount reference (no bank details needed), and
 * Stripe's `reference` (a connected account id) is everything a Stripe transfer needs — both
 * leave these two fields `null`.
 */
@Schema({ _id: false })
export class PayoutAccount {
  @Prop({ type: String, enum: PAYMENT_PROVIDERS, required: true })
  provider: PaymentProvider;

  @Prop({
    type: String,
    enum: PAYOUT_ACCOUNT_STATUSES,
    required: true,
    default: 'pending',
  })
  status: PayoutAccountStatus;

  @Prop({ type: String, default: null })
  reference: string | null;

  @Prop({ type: String, default: null })
  bankCode: string | null;

  @Prop({ type: String, default: null })
  accountNumber: string | null;
}

export const PayoutAccountSchema = SchemaFactory.createForClass(PayoutAccount);
