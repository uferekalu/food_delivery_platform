import { api } from "../api";
import type { StoreCatalog } from "../restaurant-types";

export const storeCatalogApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getStoreCatalog: builder.query<StoreCatalog, string>({
      query: (storeId) => `/stores/${storeId}/catalog`,
      providesTags: (_result, _error, storeId) => [{ type: "StoreCatalog", id: storeId }],
    }),
  }),
});

export const { useGetStoreCatalogQuery } = storeCatalogApi;
