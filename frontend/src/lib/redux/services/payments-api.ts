import { api } from "../api";
import type { Order, PaymentProvider } from "../restaurant-types";

export interface InitiatePaymentInput {
  orderId: string;
  provider?: PaymentProvider;
}

export interface InitiatePaymentResult {
  redirectUrl: string;
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
  }),
});

export const { useInitiatePaymentMutation, useGetPaymentProvidersQuery, useVerifyPaymentMutation } =
  paymentsApi;
