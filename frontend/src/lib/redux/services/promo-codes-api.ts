import { api } from "../api";

export interface ValidatePromoCodeInput {
  code: string;
  restaurantId: string;
  subtotal: number;
}

export type PromoCodeValidation =
  | { valid: true; promoCodeId: string; discountAmount: number }
  | { valid: false; reason: string };

export const promoCodesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // A mutation, not a query — validating a code is an on-demand action (triggered by an
    // "Apply" button), not cacheable data tied to a stable key.
    validatePromoCode: builder.mutation<PromoCodeValidation, ValidatePromoCodeInput>({
      query: (body) => ({ url: "/promo-codes/validate", method: "POST", body }),
    }),
  }),
});

export const { useValidatePromoCodeMutation } = promoCodesApi;
