import { api } from "../api";
import type {
  AdCampaign,
  AdminAdCampaign,
  PaginatedResultWithTotals,
  PaymentProvider,
} from "../restaurant-types";

// AdCampaignAdminView is a subset of AdminAdCampaign's shape reused for the paginated
// admin-wide ledger (docs/ROADMAP.md FDP-128) — same vendor-name-resolved fields.
type AdCampaignTransaction = AdminAdCampaign;

export interface CreateAdCampaignInput {
  restaurantId?: string;
  storeId?: string;
  startDate: string;
  durationDays: number;
  totalPriceOverride?: number;
  adminNotes?: string;
}

export interface ListAdCampaignTransactionsParams {
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const adCampaignsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listAdCampaigns: builder.query<AdminAdCampaign[], void>({
      query: () => "/ad-campaigns",
      providesTags: (result) =>
        result
          ? [
              ...result.map((c) => ({ type: "AdCampaign" as const, id: c._id })),
              { type: "AdCampaign" as const, id: "LIST" },
            ]
          : [{ type: "AdCampaign", id: "LIST" }],
    }),

    // Admin-wide ad-campaign revenue ledger (docs/ROADMAP.md FDP-128) — paginated and
    // date-filterable, separate from listAdCampaigns above which the existing Ad Campaigns
    // admin tab (FDP-124) still uses unpaginated.
    getAdCampaignTransactions: builder.query<
      PaginatedResultWithTotals<AdCampaignTransaction>,
      ListAdCampaignTransactionsParams | void
    >({
      query: (params) => {
        const search = new URLSearchParams();
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== "") search.set(key, String(value));
          });
        }
        const qs = search.toString();
        return `/admin/transactions/ad-campaigns${qs ? `?${qs}` : ""}`;
      },
      providesTags: [{ type: "AdCampaign", id: "ADMIN_TRANSACTIONS_LIST" }],
    }),

    // A vendor's own campaigns across every restaurant/store they own (docs/ROADMAP.md FDP-124).
    listMyAdCampaigns: builder.query<AdCampaign[], void>({
      query: () => "/ad-campaigns/mine",
      providesTags: (result) =>
        result
          ? [
              ...result.map((c) => ({ type: "AdCampaign" as const, id: c._id })),
              { type: "AdCampaign" as const, id: "LIST" },
            ]
          : [{ type: "AdCampaign", id: "LIST" }],
    }),

    getAdCampaign: builder.query<AdCampaign, string>({
      query: (id) => `/ad-campaigns/${id}`,
      providesTags: (result, _error, id) => [{ type: "AdCampaign", id }],
    }),

    createAdCampaign: builder.mutation<AdCampaign, CreateAdCampaignInput>({
      query: (body) => ({ url: "/ad-campaigns", method: "POST", body }),
      invalidatesTags: [{ type: "AdCampaign", id: "LIST" }],
    }),

    initiateAdCampaignPayment: builder.mutation<
      { redirectUrl: string },
      { id: string; provider?: PaymentProvider }
    >({
      query: ({ id, provider }) => ({
        url: `/ad-campaigns/${id}/pay`,
        method: "POST",
        body: provider ? { provider } : {},
      }),
    }),

    verifyAdCampaignPayment: builder.mutation<AdCampaign, string>({
      query: (id) => ({ url: `/ad-campaigns/${id}/verify`, method: "POST" }),
      invalidatesTags: (result, _error, id) => [
        { type: "AdCampaign", id },
        { type: "AdCampaign", id: "LIST" },
      ],
    }),

    markAdCampaignPaidManually: builder.mutation<AdCampaign, string>({
      query: (id) => ({ url: `/ad-campaigns/${id}/mark-paid`, method: "PATCH" }),
      invalidatesTags: (result, _error, id) => [
        { type: "AdCampaign", id },
        { type: "AdCampaign", id: "LIST" },
      ],
    }),

    cancelAdCampaign: builder.mutation<AdCampaign, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({
        url: `/ad-campaigns/${id}/cancel`,
        method: "PATCH",
        body: reason ? { reason } : {},
      }),
      invalidatesTags: (result, _error, { id }) => [
        { type: "AdCampaign", id },
        { type: "AdCampaign", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListAdCampaignsQuery,
  useGetAdCampaignTransactionsQuery,
  useListMyAdCampaignsQuery,
  useGetAdCampaignQuery,
  useCreateAdCampaignMutation,
  useInitiateAdCampaignPaymentMutation,
  useVerifyAdCampaignPaymentMutation,
  useMarkAdCampaignPaidManuallyMutation,
  useCancelAdCampaignMutation,
} = adCampaignsApi;
