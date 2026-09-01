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
  }),
});

export const {
  useInitiatePaymentMutation,
  useGetPaymentProvidersQuery,
  useVerifyPaymentMutation,
  useListPaystackBanksQuery,
  useResolvePaystackAccountMutation,
  useSetupPaystackPayoutMutation,
} = paymentsApi;
