import { api } from "../api";
import type { Address, OpeningHour, PaginatedResult, Restaurant } from "../restaurant-types";

export interface ListRestaurantsParams {
  search?: string;
  cuisine?: string;
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
      query: (id) => ({ url: `/restaurants/${id}/approve`, method: "PATCH" }),
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
  useGetMyRestaurantsQuery,
  useCreateRestaurantMutation,
  useUpdateRestaurantMutation,
  useToggleRestaurantOpenMutation,
  useApproveRestaurantMutation,
  useListPendingRestaurantsQuery,
} = restaurantsApi;
