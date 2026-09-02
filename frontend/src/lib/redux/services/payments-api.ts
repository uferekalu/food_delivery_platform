import { api } from "../api";
import type { Order, PaymentProvider, Restaurant } from "../restaurant-types";

export interface InitiatePaymentInput {
  orderId: string;
  provider?: PaymentProvider;
}

export interface InitiatePaymentResult {
  redirectUrl: string;
}

// Vendor payouts epic, part 2 of 4 (docs/ROADMAP.md FDP-52).
export interface PaystackBank {
  name: string;
  code: string;
}

export interface ResolvePaystackAccountInput {
  restaurantId: string;
  accountNumber: string;
  bankCode: string;
}

export interface ResolvedPaystackAccount {
  accountNumber: string;
  accountName: string;
}

export interface SetupPaystackPayoutResult {
  restaurant: Restaurant;
  verifiedAccountName: string;
}

// Vendor payouts epic, part 3 of 4 (docs/ROADMAP.md FDP-53) — same shapes as the Paystack ones
// above, mirrored for Flutterwave.
export interface FlutterwaveBank {
  name: string;
  code: string;
}

export interface ResolveFlutterwaveAccountInput {
  restaurantId: string;
  accountNumber: string;
  bankCode: string;
}

export interface ResolvedFlutterwaveAccount {
  accountNumber: string;
  accountName: string;
}

export interface SetupFlutterwavePayoutResult {
  restaurant: Restaurant;
  verifiedAccountName: string;
}

// Vendor payouts epic, part 4 of 4 (docs/ROADMAP.md FDP-54) — structurally different from
// Paystack/Flutterwave: no bank-list/account-resolve step, since Stripe's own hosted onboarding
// flow collects bank details directly (never touches this backend). Setup only ever returns a
// URL to redirect the owner to; whether the account actually becomes active is decided later by
// Stripe's account.updated webhook, not by this response.
export interface SetupStripePayoutResult {
  onboardingUrl: string;
}

export const paymentsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    initiatePayment: builder.mutation<InitiatePaymentResult, InitiatePaymentInput>({
      query: (body) => ({ url: "/payments/initiate", method: "POST", body }),
    }),

    getPaymentProviders: builder.query<PaymentProvider[], string>({
      query: (currency) => `/payments/providers?currency=${encodeURIComponent(currency)}`,
    }),

    // Active nudge called from the checkout callback page right after the provider redirects
    // back, so the customer never gets stuck waiting on a webhook that may never arrive at this
    // deploy — see docs/ROADMAP.md's payment-verification fix and PaymentsService.verifyPayment.
    verifyPayment: builder.mutation<Order, string>({
      query: (orderId) => ({ url: `/payments/${orderId}/verify`, method: "POST" }),
    }),

    listPaystackBanks: builder.query<PaystackBank[], void>({
      query: () => "/payments/paystack/banks",
    }),

    resolvePaystackAccount: builder.mutation<ResolvedPaystackAccount, ResolvePaystackAccountInput>({
      query: ({ restaurantId, ...body }) => ({
        url: `/restaurants/${restaurantId}/payout/paystack/resolve-account`,
        method: "POST",
        body,
      }),
    }),

    setupPaystackPayout: builder.mutation<SetupPaystackPayoutResult, ResolvePaystackAccountInput>({
      query: ({ restaurantId, ...body }) => ({
        url: `/restaurants/${restaurantId}/payout/paystack/setup`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { restaurantId }) => [
        { type: "Order", id: `EARNINGS-${restaurantId}` },
      ],
    }),

    listFlutterwaveBanks: builder.query<FlutterwaveBank[], void>({
      query: () => "/payments/flutterwave/banks",
    }),

    resolveFlutterwaveAccount: builder.mutation<ResolvedFlutterwaveAccount, ResolveFlutterwaveAccountInput>({
      query: ({ restaurantId, ...body }) => ({
        url: `/restaurants/${restaurantId}/payout/flutterwave/resolve-account`,
        method: "POST",
        body,
      }),
    }),

    setupFlutterwavePayout: builder.mutation<SetupFlutterwavePayoutResult, ResolveFlutterwaveAccountInput>({
      query: ({ restaurantId, ...body }) => ({
        url: `/restaurants/${restaurantId}/payout/flutterwave/setup`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { restaurantId }) => [
        { type: "Order", id: `EARNINGS-${restaurantId}` },
      ],
    }),

    setupStripePayout: builder.mutation<SetupStripePayoutResult, string>({
      query: (restaurantId) => ({
        url: `/restaurants/${restaurantId}/payout/stripe/setup`,
        method: "POST",
      }),
    }),
  }),
});

export const {
  useInitiatePaymentMutation,
  useGetPaymentProvidersQuery,
  useVerifyPaymentMutation,
  useListPaystackBanksQuery,
  useResolvePaystackAccountMutation,
  useSetupPaystackPayoutMutation,
  useListFlutterwaveBanksQuery,
  useResolveFlutterwaveAccountMutation,
  useSetupFlutterwavePayoutMutation,
  useSetupStripePayoutMutation,
} = paymentsApi;
