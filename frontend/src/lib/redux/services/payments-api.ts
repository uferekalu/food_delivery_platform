import { api } from "../api";
import type { PaymentProvider } from "../restaurant-types";

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
  }),
});

export const { useInitiatePaymentMutation, useGetPaymentProvidersQuery } = paymentsApi;
