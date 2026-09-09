import { api } from "../api";
import type { AdminAnalytics, AdminPromoCode, DiscountType, Order, PromoCode } from "../restaurant-types";

export interface CreatePromoCodeInput {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  restaurantId?: string;
  storeId?: string;
  expiresAt?: string;
  isActive?: boolean;
  usageLimit?: number;
}

export type UpdatePromoCodeInput = Partial<CreatePromoCodeInput>;

export const adminApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getAdminAnalytics: builder.query<AdminAnalytics, void>({
      query: () => "/admin/analytics",
      providesTags: [{ type: "AdminAnalytics", id: "SUMMARY" }],
    }),

    listPromoCodes: builder.query<AdminPromoCode[], void>({
      query: () => "/promo-codes",
      providesTags: (result) =>
        result
          ? [...result.map((p) => ({ type: "PromoCode" as const, id: p._id })), { type: "PromoCode" as const, id: "LIST" }]
          : [{ type: "PromoCode", id: "LIST" }],
    }),

    // A vendor's own promo codes (docs/ROADMAP.md FDP-111) — scoped to any restaurant/store they
    // own, never the full platform-wide list listPromoCodes returns for an admin.
    listMyPromoCodes: builder.query<PromoCode[], void>({
      query: () => "/promo-codes/mine",
      providesTags: (result) =>
        result
          ? [...result.map((p) => ({ type: "PromoCode" as const, id: p._id })), { type: "PromoCode" as const, id: "LIST" }]
          : [{ type: "PromoCode", id: "LIST" }],
    }),

    createPromoCode: builder.mutation<PromoCode, CreatePromoCodeInput>({
      query: (body) => ({ url: "/promo-codes", method: "POST", body }),
      invalidatesTags: [{ type: "PromoCode", id: "LIST" }],
    }),

    updatePromoCode: builder.mutation<PromoCode, { id: string; body: UpdatePromoCodeInput }>({
      query: ({ id, body }) => ({ url: `/promo-codes/${id}`, method: "PATCH", body }),
      invalidatesTags: (result, _error, { id }) => [
        { type: "PromoCode", id },
        { type: "PromoCode", id: "LIST" },
      ],
    }),

    getOrderAsAdmin: builder.query<Order, string>({
      query: (orderId) => `/orders/admin/${orderId}`,
      providesTags: (result, _error, orderId) => [{ type: "Order", id: orderId }],
    }),

    refundOrder: builder.mutation<Order, string>({
      query: (orderId) => ({ url: `/payments/${orderId}/refund`, method: "POST" }),
      invalidatesTags: (result, _error, orderId) => [
        { type: "Order", id: orderId },
        { type: "AdminAnalytics", id: "SUMMARY" },
        { type: "Order", id: "NEEDS_REFUND_ATTENTION" },
      ],
    }),

    // Refund-hardening pass (docs/ROADMAP.md FDP-104) — every order needing a human to look at
    // its refund status: cancelled-but-never-refunded, or stuck on an ambiguous refund outcome.
    getOrdersNeedingRefundAttention: builder.query<Order[], void>({
      query: () => "/orders/admin/needs-refund-attention",
      providesTags: [{ type: "Order", id: "NEEDS_REFUND_ATTENTION" }],
    }),

    resolveRefundReconciliation: builder.mutation<Order, { orderId: string; refundActuallySucceeded: boolean }>({
      query: ({ orderId, refundActuallySucceeded }) => ({
        url: `/payments/${orderId}/resolve-refund-reconciliation`,
        method: "PATCH",
        body: { refundActuallySucceeded },
      }),
      invalidatesTags: (result, _error, { orderId }) => [
        { type: "Order", id: orderId },
        { type: "Order", id: "NEEDS_REFUND_ATTENTION" },
      ],
    }),
  }),
});

export const {
  useGetAdminAnalyticsQuery,
  useListPromoCodesQuery,
  useListMyPromoCodesQuery,
  useCreatePromoCodeMutation,
  useUpdatePromoCodeMutation,
  useGetOrderAsAdminQuery,
  useLazyGetOrderAsAdminQuery,
  useRefundOrderMutation,
  useGetOrdersNeedingRefundAttentionQuery,
  useResolveRefundReconciliationMutation,
} = adminApi;
