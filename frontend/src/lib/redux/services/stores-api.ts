import { api } from "../api";
import type { PaginatedResult, Store, StoreSort, StoreType } from "../restaurant-types";

export interface ListStoresParams {
  type: StoreType;
  search?: string;
  tag?: string;
  minRating?: number;
  maxDeliveryMinutes?: number;
  sort?: StoreSort;
  page?: number;
  limit?: number;
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const storesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listStores: builder.query<PaginatedResult<Store>, ListStoresParams>({
      query: (params) => `/stores${toQueryString({ ...params })}`,
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((s) => ({ type: "Store" as const, id: s._id })),
              { type: "Store" as const, id: "LIST" },
            ]
          : [{ type: "Store" as const, id: "LIST" }],
    }),

    getStoreBySlug: builder.query<Store, string>({
      query: (slug) => `/stores/${slug}`,
      providesTags: (result) => (result ? [{ type: "Store", id: result._id }] : []),
    }),
  }),
});

export const { useListStoresQuery, useGetStoreBySlugQuery } = storesApi;
