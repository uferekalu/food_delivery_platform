import { api } from "../api";
import type { MenuCategory, ModifierGroup } from "../restaurant-types";

export interface CreateCategoryInput {
  name: string;
  sortOrder?: number;
}

export interface CreateItemInput {
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  sortOrder?: number;
  modifierGroups?: ModifierGroup[];
}

export type UpdateItemInput = Partial<CreateItemInput>;

export const menuApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMenu: builder.query<MenuCategory[], string>({
      query: (restaurantId) => `/restaurants/${restaurantId}/menu`,
      providesTags: (_result, _error, restaurantId) => [{ type: "Menu", id: restaurantId }],
    }),

    createCategory: builder.mutation<MenuCategory, { restaurantId: string; body: CreateCategoryInput }>({
      query: ({ restaurantId, body }) => ({
        url: `/restaurants/${restaurantId}/menu/categories`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { restaurantId }) => [{ type: "Menu", id: restaurantId }],
    }),

    deleteCategory: builder.mutation<void, { restaurantId: string; categoryId: string }>({
      query: ({ restaurantId, categoryId }) => ({
        url: `/restaurants/${restaurantId}/menu/categories/${categoryId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { restaurantId }) => [{ type: "Menu", id: restaurantId }],
    }),

    createItem: builder.mutation<void, { restaurantId: string; body: CreateItemInput }>({
      query: ({ restaurantId, body }) => ({
        url: `/restaurants/${restaurantId}/menu/items`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { restaurantId }) => [{ type: "Menu", id: restaurantId }],
    }),

    updateItem: builder.mutation<void, { restaurantId: string; itemId: string; body: UpdateItemInput }>({
      query: ({ restaurantId, itemId, body }) => ({
        url: `/restaurants/${restaurantId}/menu/items/${itemId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { restaurantId }) => [{ type: "Menu", id: restaurantId }],
    }),

    deleteItem: builder.mutation<void, { restaurantId: string; itemId: string }>({
      query: ({ restaurantId, itemId }) => ({
        url: `/restaurants/${restaurantId}/menu/items/${itemId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { restaurantId }) => [{ type: "Menu", id: restaurantId }],
    }),

    toggleItemAvailability: builder.mutation<void, { restaurantId: string; itemId: string }>({
      query: ({ restaurantId, itemId }) => ({
        url: `/restaurants/${restaurantId}/menu/items/${itemId}/availability`,
        method: "PATCH",
      }),
      invalidatesTags: (_result, _error, { restaurantId }) => [{ type: "Menu", id: restaurantId }],
    }),
  }),
});

export const {
  useGetMenuQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useCreateItemMutation,
  useUpdateItemMutation,
  useDeleteItemMutation,
  useToggleItemAvailabilityMutation,
} = menuApi;
