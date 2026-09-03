import { api } from "../api";
import type { Cart } from "../restaurant-types";

export interface AddCartItemInput {
  menuItemId: string;
  qty?: number;
  selectedModifiers?: { groupName: string; optionName: string }[];
  notes?: string;
  replace?: boolean;
}

// Store-catalog counterpart of AddCartItemInput (docs/ROADMAP.md FDP-56) — products have no
// modifiers, so there's no selectedModifiers field here.
export interface AddStoreCartItemInput {
  productId: string;
  qty?: number;
  notes?: string;
  replace?: boolean;
}

export interface UpdateCartItemInput {
  qty?: number;
  notes?: string;
}

export const cartApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getCart: builder.query<Cart, void>({
      query: () => "/cart",
      providesTags: ["Cart"],
    }),

    addCartItem: builder.mutation<Cart, AddCartItemInput>({
      query: (body) => ({ url: "/cart/items", method: "POST", body }),
      invalidatesTags: ["Cart"],
    }),

    addStoreItem: builder.mutation<Cart, AddStoreCartItemInput>({
      query: (body) => ({ url: "/cart/store-items", method: "POST", body }),
      invalidatesTags: ["Cart"],
    }),

    updateCartItem: builder.mutation<Cart, { cartItemId: string; body: UpdateCartItemInput }>({
      query: ({ cartItemId, body }) => ({ url: `/cart/items/${cartItemId}`, method: "PATCH", body }),
      invalidatesTags: ["Cart"],
    }),

    removeCartItem: builder.mutation<Cart, string>({
      query: (cartItemId) => ({ url: `/cart/items/${cartItemId}`, method: "DELETE" }),
      invalidatesTags: ["Cart"],
    }),

    clearCart: builder.mutation<void, void>({
      query: () => ({ url: "/cart", method: "DELETE" }),
      invalidatesTags: ["Cart"],
    }),
  }),
});

export const {
  useGetCartQuery,
  useAddCartItemMutation,
  useAddStoreItemMutation,
  useUpdateCartItemMutation,
  useRemoveCartItemMutation,
  useClearCartMutation,
} = cartApi;
