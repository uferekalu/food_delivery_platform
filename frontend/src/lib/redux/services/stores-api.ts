import { api } from "../api";
import type {
  Address,
  OpeningHour,
  PaginatedResult,
  Store,
  StoreSort,
  StoreType,
  StoreWithDistance,
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

// "Stores near me" (docs/ROADMAP.md FDP-96) — `type` required, same reasoning as
// ListStoresParams (a category-listing view always picks exactly one type).
export interface NearbyStoresParams {
  lat: number;
  lng: number;
  type: StoreType;
  radiusKm?: number;
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

    getNearbyStores: builder.query<PaginatedResult<StoreWithDistance>, NearbyStoresParams>({
      query: (params) => `/stores/nearby${toQueryString({ ...params })}`,
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((s) => ({ type: "Store" as const, id: s._id })),
              { type: "Store" as const, id: "NEARBY" },
            ]
          : [{ type: "Store" as const, id: "NEARBY" }],
    }),

    // Unlike getStoreBySlug, this isn't filtered to approved stores — it's how an admin reviews
    // a pending application (incl. its catalog) before approving it.
    getStoreByIdForAdmin: builder.query<Store, string>({
      query: (id) => `/stores/admin/${id}`,
      providesTags: (result) => (result ? [{ type: "Store", id: result._id }] : []),
    }),

    listPendingStores: builder.query<Store[], void>({
      query: () => "/stores/pending",
      providesTags: (result) =>
        result
          ? [...result.map((s) => ({ type: "Store" as const, id: s._id })), { type: "Store" as const, id: "PENDING" }]
          : [{ type: "Store", id: "PENDING" }],
    }),

    approveStore: builder.mutation<Store, string>({
      // Lives under /admin, not /stores, since approval requires checking both a Store-owned
      // invariant and a Product-owned one (docs/ROADMAP.md FDP-56, mirroring approveRestaurant).
      query: (id) => ({ url: `/admin/stores/${id}/approve`, method: "PATCH" }),
      invalidatesTags: (result, _error, id) => [
        { type: "Store", id },
        { type: "Store", id: "LIST" },
        { type: "MyStores", id },
        { type: "Store", id: "PENDING" },
      ],
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
  useGetNearbyStoresQuery,
  useGetStoreByIdForAdminQuery,
  useListPendingStoresQuery,
  useApproveStoreMutation,
  useGetMyStoresQuery,
  useCreateStoreMutation,
  useUpdateStoreMutation,
  useToggleStoreOpenMutation,
} = storesApi;
