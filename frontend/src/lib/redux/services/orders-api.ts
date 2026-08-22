import { api } from "../api";
import type { Address, Order } from "../restaurant-types";

export interface CreateOrderInput {
  deliveryAddress: Address;
  deliveryInstructions?: string;
  /** ISO datetime; omitted means ASAP. */
  scheduledFor?: string;
  promoCode?: string;
}

export const ordersApi = api.injectEndpoints({
  endpoints: (builder) => ({
    createOrder: builder.mutation<Order, CreateOrderInput>({
      query: (body) => ({ url: "/orders", method: "POST", body }),
      invalidatesTags: [{ type: "Order", id: "LIST" }, "Cart"],
    }),

    getOrder: builder.query<Order, string>({
      query: (id) => `/orders/${id}`,
      providesTags: (result) => (result ? [{ type: "Order", id: result._id }] : []),
    }),

    getMyOrders: builder.query<Order[], void>({
      query: () => "/orders/mine",
      providesTags: (result) =>
        result
          ? [...result.map((o) => ({ type: "Order" as const, id: o._id })), { type: "Order" as const, id: "LIST" }]
          : [{ type: "Order", id: "LIST" }],
    }),
  }),
});

export const { useCreateOrderMutation, useGetOrderQuery, useGetMyOrdersQuery } = ordersApi;
