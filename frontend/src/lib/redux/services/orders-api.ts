import { api } from "../api";
import type { Address, Order, OrderStatus } from "../restaurant-types";

export interface CreateOrderInput {
  deliveryAddress: Address;
  deliveryInstructions?: string;
  /** ISO datetime; omitted means ASAP. */
  scheduledFor?: string;
  promoCode?: string;
}

// Vendor payouts epic, part 1 of 4 (docs/ROADMAP.md FDP-51).
export interface RestaurantEarnings {
  currency: string;
  deliveredOrders: number;
  grossRevenue: number;
  platformFeeTotal: number;
  netEarned: number;
  payoutSetupComplete: boolean;
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

    getRestaurantOrders: builder.query<Order[], string>({
      query: (restaurantId) => `/orders/restaurant/${restaurantId}`,
      providesTags: (result) =>
        result
          ? [...result.map((o) => ({ type: "Order" as const, id: o._id })), { type: "Order" as const, id: "QUEUE" }]
          : [{ type: "Order", id: "QUEUE" }],
    }),

    getRestaurantEarnings: builder.query<RestaurantEarnings, string>({
      query: (restaurantId) => `/orders/restaurant/${restaurantId}/earnings`,
      providesTags: (_result, _error, restaurantId) => [{ type: "Order", id: `EARNINGS-${restaurantId}` }],
    }),

    updateOrderStatus: builder.mutation<Order, { orderId: string; status: OrderStatus }>({
      query: ({ orderId, status }) => ({ url: `/orders/${orderId}/status`, method: "PATCH", body: { status } }),
      invalidatesTags: (result, _error, { orderId }) => [
        { type: "Order", id: orderId },
        { type: "Order", id: "QUEUE" },
      ],
    }),
  }),
});

export const {
  useCreateOrderMutation,
  useGetOrderQuery,
  useGetMyOrdersQuery,
  useGetRestaurantOrdersQuery,
  useGetRestaurantEarningsQuery,
  useUpdateOrderStatusMutation,
} = ordersApi;
