import { api } from "../api";
import type { PaginatedResult } from "../restaurant-types";

export const PAYOUT_STATUSES = ["pending", "processing", "succeeded", "failed"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PAYOUT_VENDOR_TYPES = ["restaurant", "store", "rider"] as const;
export type PayoutVendorType = (typeof PAYOUT_VENDOR_TYPES)[number];

export interface Payout {
  _id: string;
  vendorType: PayoutVendorType;
  vendorId: string;
  orderIds: string[];
  grossAmount: number;
  currency: string;
  provider: "stripe" | "paystack" | "flutterwave";
  payoutAccountReference: string;
  status: PayoutStatus;
  providerTransferReference: string | null;
  failureReason: string | null;
  retryCount: number;
  reconciliationRequired: boolean;
  reconciledAt: string | null;
  reconciledBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListPayoutsParams {
  page?: number;
  limit?: number;
  status?: PayoutStatus;
  vendorType?: PayoutVendorType;
  reconciliationRequired?: boolean;
}

export interface PayoutBatchSummary {
  succeeded: number;
  failed: number;
  reconciliationNeeded: number;
  skipped: number;
}

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const payoutsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Admin dashboard — every payout, across every vendor/rider.
    listAllPayouts: builder.query<PaginatedResult<Payout>, ListPayoutsParams | void>({
      query: (params) => `/payouts${toQueryString({ ...params })}`,
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((p) => ({ type: "Payout" as const, id: p._id })),
              { type: "Payout" as const, id: "LIST" },
            ]
          : [{ type: "Payout" as const, id: "LIST" }],
    }),

    listRestaurantPayouts: builder.query<
      PaginatedResult<Payout>,
      { restaurantId: string } & ListPayoutsParams
    >({
      query: ({ restaurantId, ...params }) =>
        `/payouts/restaurants/${restaurantId}${toQueryString({ ...params })}`,
      providesTags: (result) =>
        result
          ? [...result.items.map((p) => ({ type: "Payout" as const, id: p._id }))]
          : [],
    }),

    listStorePayouts: builder.query<PaginatedResult<Payout>, { storeId: string } & ListPayoutsParams>({
      query: ({ storeId, ...params }) => `/payouts/stores/${storeId}${toQueryString({ ...params })}`,
      providesTags: (result) =>
        result
          ? [...result.items.map((p) => ({ type: "Payout" as const, id: p._id }))]
          : [],
    }),

    listMyRiderPayouts: builder.query<PaginatedResult<Payout>, ListPayoutsParams | void>({
      query: (params) => `/payouts/riders/me${toQueryString({ ...params })}`,
      providesTags: (result) =>
        result
          ? [...result.items.map((p) => ({ type: "Payout" as const, id: p._id }))]
          : [],
    }),

    runWeeklyPayoutBatch: builder.mutation<PayoutBatchSummary, void>({
      query: () => ({ url: "/payouts/run-weekly-batch", method: "POST" }),
      invalidatesTags: [{ type: "Payout", id: "LIST" }],
    }),

    resolvePayoutReconciliation: builder.mutation<
      Payout,
      { id: string; transferActuallySucceeded: boolean }
    >({
      query: ({ id, transferActuallySucceeded }) => ({
        url: `/payouts/${id}/resolve-reconciliation`,
        method: "PATCH",
        body: { transferActuallySucceeded },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Payout", id },
        { type: "Payout", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListAllPayoutsQuery,
  useListRestaurantPayoutsQuery,
  useListStorePayoutsQuery,
  useListMyRiderPayoutsQuery,
  useRunWeeklyPayoutBatchMutation,
  useResolvePayoutReconciliationMutation,
} = payoutsApi;
