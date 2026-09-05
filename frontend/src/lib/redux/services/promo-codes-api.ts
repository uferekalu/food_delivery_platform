import { api } from "../api";

// Exactly one of restaurantId/storeId, matching the cart's own sellerType (docs/ROADMAP.md
// FDP-90) — a store cart validates against storeId, a restaurant cart against restaurantId.
export type ValidatePromoCodeInput = {
  code: string;
  subtotal: number;
} & ({ restaurantId: string; storeId?: never } | { storeId: string; restaurantId?: never });

export type PromoCodeValidation =
  | { valid: true; promoCodeId: string; discountAmount: number }
  // `minOrderAmount` is only set for the min-order-not-met rejection — the backend has no
  // currency in scope to format it with, so the caller builds its own currency-aware message
  // using the cart's own currency instead of rendering `reason` verbatim for this one case.
  | { valid: false; reason: string; minOrderAmount?: number };

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
