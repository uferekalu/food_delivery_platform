import { api } from "../api";
import type {
  Address,
  OpeningHour,
  PaginatedResult,
  Store,
  StoreSort,
  StoreType,
} from "../restaurant-types";

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

export interface StoreInput {
  name: string;
  type: StoreType;
  tags?: string[];
  description?: string;
  currency: string;
  country: string;
  address: Address;
  openingHours?: OpeningHour[];
  estimatedDeliveryMinutes?: number;
  // Business registration proof (docs/ROADMAP.md FDP-60) — required by the backend at creation,
  // hence not optional here even though UpdateStoreInput below loosens every field.
  complianceDocumentUrl: string;
}

export interface UpdateStoreInput extends Partial<StoreInput> {
  logoUrl?: string;
  coverUrl?: string;
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

    getMyStores: builder.query<Store[], void>({
      query: () => "/stores/mine",
      providesTags: (result) =>
        result
          ? [...result.map((s) => ({ type: "MyStores" as const, id: s._id })), { type: "MyStores", id: "LIST" }]
          : [{ type: "MyStores", id: "LIST" }],
    }),

    createStore: builder.mutation<Store, StoreInput>({
      query: (body) => ({ url: "/stores", method: "POST", body }),
      invalidatesTags: [{ type: "MyStores", id: "LIST" }],
    }),

    updateStore: builder.mutation<Store, { id: string; body: UpdateStoreInput }>({
      query: ({ id, body }) => ({ url: `/stores/${id}`, method: "PATCH", body }),
      invalidatesTags: (result, _error, { id }) => [
        { type: "MyStores", id },
        { type: "MyStores", id: "LIST" },
        { type: "Store", id },
        { type: "Store", id: "LIST" },
      ],
    }),

    toggleStoreOpen: builder.mutation<Store, string>({
      query: (id) => ({ url: `/stores/${id}/toggle-open`, method: "PATCH" }),
      invalidatesTags: (result, _error, id) => [{ type: "MyStores", id }],
    }),
  }),
});

export const {
  useListStoresQuery,
  useGetStoreBySlugQuery,
  useGetMyStoresQuery,
  useCreateStoreMutation,
  useUpdateStoreMutation,
  useToggleStoreOpenMutation,
} = storesApi;
