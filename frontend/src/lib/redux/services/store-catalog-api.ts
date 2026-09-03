import { api } from "../api";
import type { StoreCatalog } from "../restaurant-types";

export interface CreateProductCategoryInput {
  name: string;
  /** Omit for a top-level category, or an existing category id to nest under it. */
  parentCategoryId?: string;
  sortOrder?: number;
}

export type UpdateProductCategoryInput = Partial<CreateProductCategoryInput>;

export interface CreateProductInput {
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  discountedPrice?: number;
  costPrice?: number;
  imageUrl?: string;
  unit?: string;
  stockQuantity?: number;
  sortOrder?: number;
}

export type UpdateProductInput = Partial<CreateProductInput>;

export const storeCatalogApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getStoreCatalog: builder.query<StoreCatalog, string>({
      query: (storeId) => `/stores/${storeId}/catalog`,
      providesTags: (_result, _error, storeId) => [{ type: "StoreCatalog", id: storeId }],
    }),

    createCategory: builder.mutation<void, { storeId: string; body: CreateProductCategoryInput }>({
      query: ({ storeId, body }) => ({
        url: `/stores/${storeId}/catalog/categories`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: "StoreCatalog", id: storeId }],
    }),

    updateCategory: builder.mutation<
      void,
      { storeId: string; categoryId: string; body: UpdateProductCategoryInput }
    >({
      query: ({ storeId, categoryId, body }) => ({
        url: `/stores/${storeId}/catalog/categories/${categoryId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: "StoreCatalog", id: storeId }],
    }),

    deleteCategory: builder.mutation<void, { storeId: string; categoryId: string }>({
      query: ({ storeId, categoryId }) => ({
        url: `/stores/${storeId}/catalog/categories/${categoryId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: "StoreCatalog", id: storeId }],
    }),

    createProduct: builder.mutation<void, { storeId: string; body: CreateProductInput }>({
      query: ({ storeId, body }) => ({
        url: `/stores/${storeId}/catalog/products`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: "StoreCatalog", id: storeId }],
    }),

    updateProduct: builder.mutation<void, { storeId: string; productId: string; body: UpdateProductInput }>({
      query: ({ storeId, productId, body }) => ({
        url: `/stores/${storeId}/catalog/products/${productId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: "StoreCatalog", id: storeId }],
    }),

    deleteProduct: builder.mutation<void, { storeId: string; productId: string }>({
      query: ({ storeId, productId }) => ({
        url: `/stores/${storeId}/catalog/products/${productId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: "StoreCatalog", id: storeId }],
    }),

    toggleProductAvailability: builder.mutation<void, { storeId: string; productId: string }>({
      query: ({ storeId, productId }) => ({
        url: `/stores/${storeId}/catalog/products/${productId}/availability`,
        method: "PATCH",
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: "StoreCatalog", id: storeId }],
    }),
  }),
});

export const {
  useGetStoreCatalogQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useToggleProductAvailabilityMutation,
} = storeCatalogApi;
