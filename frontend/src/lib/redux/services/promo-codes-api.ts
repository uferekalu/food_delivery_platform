import { api } from "../api";
import type { DiscountType } from "../restaurant-types";

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

// The "Use code X for Y% off" discovery banner (docs/ROADMAP.md FDP-112) — a public-facing,
// deliberately minimal projection (no usedCount/isActive/etc — a visitor doesn't need those,
// findActiveForSeller already only returns codes that are genuinely usable right now).
export interface ActivePromoCode {
  _id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
}

// A third, seller-less variant (docs/ROADMAP.md FDP-116) — the general marketplace-browsing
// banner (homepage, the all-restaurants listing, category pages) has no specific restaurant/
// store to check scoped codes against yet, so it asks for platform-wide codes only.
export type ActivePromoCodesInput =
  | { restaurantId: string; storeId?: never }
  | { storeId: string; restaurantId?: never }
  | { restaurantId?: never; storeId?: never };

export const promoCodesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // A mutation, not a query — validating a code is an on-demand action (triggered by an
    // "Apply" button), not cacheable data tied to a stable key.
    validatePromoCode: builder.mutation<PromoCodeValidation, ValidatePromoCodeInput>({
      query: (body) => ({ url: "/promo-codes/validate", method: "POST", body }),
    }),

    getActivePromoCodes: builder.query<ActivePromoCode[], ActivePromoCodesInput>({
      query: (params) => {
        const search = new URLSearchParams();
        if (params.restaurantId) search.set("restaurantId", params.restaurantId);
        if (params.storeId) search.set("storeId", params.storeId);
        return `/promo-codes/active?${search.toString()}`;
      },
      providesTags: [{ type: "PromoCode", id: "ACTIVE" }],
    }),
  }),
});

export const { useValidatePromoCodeMutation, useGetActivePromoCodesQuery } = promoCodesApi;
