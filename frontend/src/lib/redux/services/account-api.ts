import { api } from "../api";
import { setCurrentUser } from "../slices/auth-slice";
import type { PublicUser } from "../types";
import type { Address, Restaurant, SavedAddress, Store } from "../restaurant-types";

export interface UpdateProfileInput {
  name?: string;
  avatarUrl?: string;
  phone?: string;
}

export interface SavedAddressInput {
  label: string;
  address: Address;
  isDefault?: boolean;
}

export const accountApi = api.injectEndpoints({
  endpoints: (builder) => ({
    updateProfile: builder.mutation<PublicUser, UpdateProfileInput>({
      query: (body) => ({ url: "/users/me", method: "PATCH", body }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          dispatch(setCurrentUser(data));
        } catch {
          // handled by the caller
        }
      },
    }),

    listAddresses: builder.query<SavedAddress[], void>({
      query: () => "/users/me/addresses",
      providesTags: (result) =>
        result
          ? [...result.map((a) => ({ type: "SavedAddress" as const, id: a._id })), { type: "SavedAddress" as const, id: "LIST" }]
          : [{ type: "SavedAddress", id: "LIST" }],
    }),

    addAddress: builder.mutation<SavedAddress, SavedAddressInput>({
      query: (body) => ({ url: "/users/me/addresses", method: "POST", body }),
      invalidatesTags: [{ type: "SavedAddress", id: "LIST" }],
    }),

    updateAddress: builder.mutation<SavedAddress, { addressId: string; body: Partial<SavedAddressInput> }>({
      query: ({ addressId, body }) => ({ url: `/users/me/addresses/${addressId}`, method: "PATCH", body }),
      invalidatesTags: [{ type: "SavedAddress", id: "LIST" }],
    }),

    removeAddress: builder.mutation<void, string>({
      query: (addressId) => ({ url: `/users/me/addresses/${addressId}`, method: "DELETE" }),
      invalidatesTags: [{ type: "SavedAddress", id: "LIST" }],
    }),

    listFavorites: builder.query<Restaurant[], void>({
      query: () => "/users/me/favorites",
      providesTags: (result) =>
        result
          ? [...result.map((r) => ({ type: "Favorite" as const, id: r._id })), { type: "Favorite" as const, id: "LIST" }]
          : [{ type: "Favorite", id: "LIST" }],
    }),

    addFavorite: builder.mutation<void, string>({
      query: (restaurantId) => ({ url: `/users/me/favorites/${restaurantId}`, method: "POST" }),
      invalidatesTags: (result, _error, restaurantId) => [
        { type: "Favorite", id: "LIST" },
        { type: "Favorite", id: restaurantId },
      ],
    }),

    removeFavorite: builder.mutation<void, string>({
      query: (restaurantId) => ({ url: `/users/me/favorites/${restaurantId}`, method: "DELETE" }),
      invalidatesTags: (result, _error, restaurantId) => [
        { type: "Favorite", id: "LIST" },
        { type: "Favorite", id: restaurantId },
      ],
    }),

    // Store-catalog counterpart of the three endpoints above (docs/ROADMAP.md FDP-137) — a
    // separate "FavoriteStore" tag rather than reusing "Favorite", since a restaurant id and a
    // store id could otherwise collide in the same tag-id space and cross-invalidate the wrong list.
    listFavoriteStores: builder.query<Store[], void>({
      query: () => "/users/me/favorite-stores",
      providesTags: (result) =>
        result
          ? [...result.map((s) => ({ type: "FavoriteStore" as const, id: s._id })), { type: "FavoriteStore" as const, id: "LIST" }]
          : [{ type: "FavoriteStore", id: "LIST" }],
    }),

    addFavoriteStore: builder.mutation<void, string>({
      query: (storeId) => ({ url: `/users/me/favorite-stores/${storeId}`, method: "POST" }),
      invalidatesTags: (result, _error, storeId) => [
        { type: "FavoriteStore", id: "LIST" },
        { type: "FavoriteStore", id: storeId },
      ],
    }),

    removeFavoriteStore: builder.mutation<void, string>({
      query: (storeId) => ({ url: `/users/me/favorite-stores/${storeId}`, method: "DELETE" }),
      invalidatesTags: (result, _error, storeId) => [
        { type: "FavoriteStore", id: "LIST" },
        { type: "FavoriteStore", id: storeId },
      ],
    }),
  }),
});

export const {
  useUpdateProfileMutation,
  useListAddressesQuery,
  useAddAddressMutation,
  useUpdateAddressMutation,
  useRemoveAddressMutation,
  useListFavoritesQuery,
  useAddFavoriteMutation,
  useRemoveFavoriteMutation,
  useListFavoriteStoresQuery,
  useAddFavoriteStoreMutation,
  useRemoveFavoriteStoreMutation,
} = accountApi;
