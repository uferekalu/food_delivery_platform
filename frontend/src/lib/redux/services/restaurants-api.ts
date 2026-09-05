import { api } from "../api";
import type {
  Address,
  OpeningHour,
  PaginatedResult,
  Restaurant,
  RestaurantSort,
  RestaurantWithDistance,
} from "../restaurant-types";

export interface ListRestaurantsParams {
  search?: string;
  cuisine?: string;
  minRating?: number;
  maxPriceLevel?: number;
  maxDeliveryMinutes?: number;
  sort?: RestaurantSort;
  page?: number;
  limit?: number;
}

// "Restaurants near me" (docs/ROADMAP.md FDP-96).
export interface NearbyRestaurantsParams {
  lat: number;
  lng: number;
  radiusKm?: number;
  page?: number;
  limit?: number;
}

export interface RestaurantInput {
  name: string;
  description?: string;
  cuisineTypes: string[];
  currency: string;
  country: string;
  address: Address;
  openingHours?: OpeningHour[];
  priceLevel?: number;
  estimatedDeliveryMinutes?: number;
  // Business registration proof (docs/ROADMAP.md FDP-60) — required by the backend at creation,
  // hence not optional here even though UpdateRestaurantInput below loosens every field.
  complianceDocumentUrl: string;
}

export interface UpdateRestaurantInput extends Partial<RestaurantInput> {
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

export const restaurantsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listRestaurants: builder.query<PaginatedResult<Restaurant>, ListRestaurantsParams | void>({
      query: (params) => `/restaurants${toQueryString({ ...params })}`,
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((r) => ({ type: "Restaurant" as const, id: r._id })),
              { type: "Restaurant" as const, id: "LIST" },
            ]
          : [{ type: "Restaurant" as const, id: "LIST" }],
    }),

    getRestaurantBySlug: builder.query<Restaurant, string>({
      query: (slug) => `/restaurants/${slug}`,
      providesTags: (result) => (result ? [{ type: "Restaurant", id: result._id }] : []),
    }),

    getNearbyRestaurants: builder.query<PaginatedResult<RestaurantWithDistance>, NearbyRestaurantsParams>({
      query: (params) => `/restaurants/nearby${toQueryString({ ...params })}`,
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((r) => ({ type: "Restaurant" as const, id: r._id })),
              { type: "Restaurant" as const, id: "NEARBY" },
            ]
          : [{ type: "Restaurant" as const, id: "NEARBY" }],
    }),

    // Unlike getRestaurantBySlug, this isn't filtered to approved restaurants — it's how an
    // admin reviews a pending application (incl. its menu) before approving it.
    getRestaurantByIdForAdmin: builder.query<Restaurant, string>({
      query: (id) => `/restaurants/admin/${id}`,
      providesTags: (result) => (result ? [{ type: "Restaurant", id: result._id }] : []),
    }),

    getMyRestaurants: builder.query<Restaurant[], void>({
      query: () => "/restaurants/mine",
      providesTags: (result) =>
        result
          ? [...result.map((r) => ({ type: "MyRestaurants" as const, id: r._id })), { type: "MyRestaurants", id: "LIST" }]
          : [{ type: "MyRestaurants", id: "LIST" }],
    }),

    createRestaurant: builder.mutation<Restaurant, RestaurantInput>({
      query: (body) => ({ url: "/restaurants", method: "POST", body }),
      invalidatesTags: [{ type: "MyRestaurants", id: "LIST" }],
    }),

    updateRestaurant: builder.mutation<Restaurant, { id: string; body: UpdateRestaurantInput }>({
      query: ({ id, body }) => ({ url: `/restaurants/${id}`, method: "PATCH", body }),
      invalidatesTags: (result, _error, { id }) => [
        { type: "MyRestaurants", id },
        { type: "MyRestaurants", id: "LIST" },
        { type: "Restaurant", id },
        { type: "Restaurant", id: "LIST" },
      ],
    }),

    toggleRestaurantOpen: builder.mutation<Restaurant, string>({
      query: (id) => ({ url: `/restaurants/${id}/toggle-open`, method: "PATCH" }),
      invalidatesTags: (result, _error, id) => [{ type: "MyRestaurants", id }],
    }),

    approveRestaurant: builder.mutation<Restaurant, string>({
      // Lives under /admin, not /restaurants, since approval requires checking both a
      // Restaurant-owned invariant and a Menu-owned one (docs/ROADMAP.md FDP-60).
      query: (id) => ({ url: `/admin/restaurants/${id}/approve`, method: "PATCH" }),
      invalidatesTags: (result, _error, id) => [
        { type: "Restaurant", id },
        { type: "Restaurant", id: "LIST" },
        { type: "MyRestaurants", id },
        { type: "Restaurant", id: "PENDING" },
      ],
    }),

    listPendingRestaurants: builder.query<Restaurant[], void>({
      query: () => "/restaurants/pending",
      providesTags: (result) =>
        result
          ? [...result.map((r) => ({ type: "Restaurant" as const, id: r._id })), { type: "Restaurant" as const, id: "PENDING" }]
          : [{ type: "Restaurant", id: "PENDING" }],
    }),
  }),
});

export const {
  useListRestaurantsQuery,
  useGetRestaurantBySlugQuery,
  useGetNearbyRestaurantsQuery,
  useGetRestaurantByIdForAdminQuery,
  useGetMyRestaurantsQuery,
  useCreateRestaurantMutation,
  useUpdateRestaurantMutation,
  useToggleRestaurantOpenMutation,
  useApproveRestaurantMutation,
  useListPendingRestaurantsQuery,
} = restaurantsApi;
