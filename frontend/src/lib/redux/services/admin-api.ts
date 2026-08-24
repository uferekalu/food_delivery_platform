import { api } from "../api";
import type { AdminAnalytics, DiscountType, Order, PromoCode } from "../restaurant-types";

export interface CreatePromoCodeInput {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  restaurantId?: string;
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

    listPromoCodes: builder.query<PromoCode[], void>({
      query: () => "/promo-codes",
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
      ],
    }),
  }),
});

export const {
  useGetAdminAnalyticsQuery,
  useListPromoCodesQuery,
  useCreatePromoCodeMutation,
  useUpdatePromoCodeMutation,
  useGetOrderAsAdminQuery,
  useLazyGetOrderAsAdminQuery,
  useRefundOrderMutation,
} = adminApi;
