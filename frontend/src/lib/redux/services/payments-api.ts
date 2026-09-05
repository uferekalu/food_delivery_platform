import { api } from "../api";
import type { Order, PaymentProvider, Restaurant, Rider, Store } from "../restaurant-types";

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

// Extended to stores and riders in docs/ROADMAP.md FDP-94 — same shapes as the restaurant ones
// above (`resolveAccount`/`setup` per provider), just scoped to a store or the caller's own
// rider profile instead. Riders take no id (self-service via /riders/me/... — see
// `RidersService`'s payout methods doc comment for why there's no separate owner).
export interface ResolveAccountInput {
  accountNumber: string;
  bankCode: string;
}

export interface SetupStorePayoutResult {
  store: Store;
  verifiedAccountName: string;
}

export interface SetupRiderPayoutResult {
  rider: Rider;
  verifiedAccountName: string;
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

    // --- Store onboarding (docs/ROADMAP.md FDP-94) ---

    resolveStorePaystackAccount: builder.mutation<
      ResolvedPaystackAccount,
      { storeId: string } & ResolveAccountInput
    >({
      query: ({ storeId, ...body }) => ({
        url: `/stores/${storeId}/payout/paystack/resolve-account`,
        method: "POST",
        body,
      }),
    }),

    setupStorePaystackPayout: builder.mutation<
      SetupStorePayoutResult,
      { storeId: string } & ResolveAccountInput
    >({
      query: ({ storeId, ...body }) => ({
        url: `/stores/${storeId}/payout/paystack/setup`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: "Payout", id: `STORE-${storeId}` }],
    }),

    resolveStoreFlutterwaveAccount: builder.mutation<
      ResolvedFlutterwaveAccount,
      { storeId: string } & ResolveAccountInput
    >({
      query: ({ storeId, ...body }) => ({
        url: `/stores/${storeId}/payout/flutterwave/resolve-account`,
        method: "POST",
        body,
      }),
    }),

    setupStoreFlutterwavePayout: builder.mutation<
      SetupStorePayoutResult,
      { storeId: string } & ResolveAccountInput
    >({
      query: ({ storeId, ...body }) => ({
        url: `/stores/${storeId}/payout/flutterwave/setup`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: "Payout", id: `STORE-${storeId}` }],
    }),

    setupStoreStripePayout: builder.mutation<SetupStripePayoutResult, string>({
      query: (storeId) => ({
        url: `/stores/${storeId}/payout/stripe/setup`,
        method: "POST",
      }),
    }),

    // --- Rider onboarding (docs/ROADMAP.md FDP-94) — self-service, no id (see class doc
    // comment on the backend controllers for why: a rider has no separate owner to check
    // ownership against). ---

    resolveRiderPaystackAccount: builder.mutation<ResolvedPaystackAccount, ResolveAccountInput>({
      query: (body) => ({
        url: "/riders/me/payout/paystack/resolve-account",
        method: "POST",
        body,
      }),
    }),

    setupRiderPaystackPayout: builder.mutation<SetupRiderPayoutResult, ResolveAccountInput>({
      query: (body) => ({
        url: "/riders/me/payout/paystack/setup",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Payout", id: "RIDER-ME" }],
    }),

    resolveRiderFlutterwaveAccount: builder.mutation<ResolvedFlutterwaveAccount, ResolveAccountInput>({
      query: (body) => ({
        url: "/riders/me/payout/flutterwave/resolve-account",
        method: "POST",
        body,
      }),
    }),

    setupRiderFlutterwavePayout: builder.mutation<SetupRiderPayoutResult, ResolveAccountInput>({
      query: (body) => ({
        url: "/riders/me/payout/flutterwave/setup",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Payout", id: "RIDER-ME" }],
    }),

    setupRiderStripePayout: builder.mutation<SetupStripePayoutResult, void>({
      query: () => ({
        url: "/riders/me/payout/stripe/setup",
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
  useResolveStorePaystackAccountMutation,
  useSetupStorePaystackPayoutMutation,
  useResolveStoreFlutterwaveAccountMutation,
  useSetupStoreFlutterwavePayoutMutation,
  useSetupStoreStripePayoutMutation,
  useResolveRiderPaystackAccountMutation,
  useSetupRiderPaystackPayoutMutation,
  useResolveRiderFlutterwaveAccountMutation,
  useSetupRiderFlutterwavePayoutMutation,
  useSetupRiderStripePayoutMutation,
} = paymentsApi;
