import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { PAYMENT_PROVIDERS } from '../../payments/payment-provider';
import type { PaymentProvider } from '../../payments/payment-provider';

export const PAYOUT_ACCOUNT_STATUSES = ['pending', 'active'] as const;
export type PayoutAccountStatus = (typeof PAYOUT_ACCOUNT_STATUSES)[number];

/**
 * Vendor payouts epic, part 1 of 4 (docs/ROADMAP.md FDP-51) — one entry per provider a
 * restaurant has (or hasn't yet) onboarded a payout-capable account with. A restaurant can need
 * more than one: `InitiatePaymentDto.provider` lets a customer override the currency's default
 * provider per order, so a restaurant's payout coverage has to mirror the same multi-provider
 * reality `PaymentProviderResolver` already models, not just its default provider.
 *
 * `reference` is the provider's own subaccount/connected-account identifier (Paystack
 * `subaccount_code`, Flutterwave subaccount id, Stripe connected account id) — always `null`
 * with `status: 'pending'` until FDP-52/53/54 actually create one via that provider's real
 * onboarding flow. Until a provider has an `active` entry here, that provider's orders for this
 * restaurant settle to the platform's own account, not the restaurant's.
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
}

export const PayoutAccountSchema = SchemaFactory.createForClass(PayoutAccount);
