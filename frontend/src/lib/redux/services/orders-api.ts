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

// Detailed sales report + COGS (docs/ROADMAP.md FDP-64).
export interface SalesReportQuery {
  restaurantId: string;
  /** ISO date/time — omitted means all-time. */
  from?: string;
  to?: string;
}

export interface SalesReportItemBreakdown {
  menuItemId: string;
  name: string;
  qtySold: number;
  revenue: number;
  cogs: number;
  profit: number;
  marginPct: number | null;
  hasIncompleteCostData: boolean;
}

export interface SalesReportDayBreakdown {
  date: string;
  orders: number;
  revenue: number;
  cogs: number;
  profit: number;
}

export interface SalesReport {
  currency: string;
  range: { from: string | null; to: string | null };
  totals: {
    orders: number;
    revenue: number;
    deliveryFeeTotal: number;
    serviceFeeTotal: number;
    discountTotal: number;
    platformFeeTotal: number;
    netEarned: number;
    totalCollected: number;
    cogs: number;
    grossProfit: number;
    grossMarginPct: number | null;
    avgOrderValue: number;
  };
  itemsMissingCostPrice: string[];
  byItem: SalesReportItemBreakdown[];
  byDay: SalesReportDayBreakdown[];
}

function salesReportQueryString({ from, to }: { from?: string; to?: string }): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
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

    // Store-catalog counterpart of getRestaurantOrders (docs/ROADMAP.md FDP-56/77) — a distinct
    // "STORE_QUEUE" tag id (rather than sharing "QUEUE") so a restaurant owner's and a store
    // owner's open queue views never cross-invalidate each other.
    getStoreOrders: builder.query<Order[], string>({
      query: (storeId) => `/orders/store/${storeId}`,
      providesTags: (result) =>
        result
          ? [
              ...result.map((o) => ({ type: "Order" as const, id: o._id })),
              { type: "Order" as const, id: "STORE_QUEUE" },
            ]
          : [{ type: "Order", id: "STORE_QUEUE" }],
    }),

    getRestaurantEarnings: builder.query<RestaurantEarnings, string>({
      query: (restaurantId) => `/orders/restaurant/${restaurantId}/earnings`,
      providesTags: (_result, _error, restaurantId) => [{ type: "Order", id: `EARNINGS-${restaurantId}` }],
    }),

    getSalesReport: builder.query<SalesReport, SalesReportQuery>({
      query: ({ restaurantId, ...range }) =>
        `/orders/restaurant/${restaurantId}/sales-report${salesReportQueryString(range)}`,
      providesTags: (_result, _error, { restaurantId }) => [{ type: "Order", id: `SALES-REPORT-${restaurantId}` }],
    }),

    updateOrderStatus: builder.mutation<Order, { orderId: string; status: OrderStatus }>({
      query: ({ orderId, status }) => ({ url: `/orders/${orderId}/status`, method: "PATCH", body: { status } }),
      // Shared by both seller types (the endpoint has no seller-type in its payload — the
      // backend dispatches on the order itself) — invalidate both possible queue views rather
      // than trying to know which one this order actually belongs to.
      invalidatesTags: (result, _error, { orderId }) => [
        { type: "Order", id: orderId },
        { type: "Order", id: "QUEUE" },
        { type: "Order", id: "STORE_QUEUE" },
      ],
    }),
  }),
});

export const {
  useCreateOrderMutation,
  useGetOrderQuery,
  useGetMyOrdersQuery,
  useGetRestaurantOrdersQuery,
  useGetStoreOrdersQuery,
  useGetRestaurantEarningsQuery,
  useGetSalesReportQuery,
  useUpdateOrderStatusMutation,
} = ordersApi;
