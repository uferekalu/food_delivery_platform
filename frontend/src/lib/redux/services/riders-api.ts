import { api } from "../api";
import type { Order, OrderStatus, Rider, VehicleType } from "../restaurant-types";

export const ridersApi = api.injectEndpoints({
  endpoints: (builder) => ({
    applyRider: builder.mutation<Rider, { vehicleType: VehicleType }>({
      query: (body) => ({ url: "/riders/apply", method: "POST", body }),
      invalidatesTags: [{ type: "Rider", id: "ME" }],
    }),

    getMyRiderProfile: builder.query<Rider, void>({
      query: () => "/riders/me",
      providesTags: [{ type: "Rider", id: "ME" }],
    }),

    toggleRiderOnline: builder.mutation<Rider, void>({
      query: () => ({ url: "/riders/me/toggle-online", method: "PATCH" }),
      invalidatesTags: [{ type: "Rider", id: "ME" }],
    }),

    getRiderQueue: builder.query<Order[], void>({
      query: () => "/riders/queue",
      providesTags: (result) =>
        result
          ? [...result.map((o) => ({ type: "Order" as const, id: o._id })), { type: "Order" as const, id: "RIDER_QUEUE" }]
          : [{ type: "Order", id: "RIDER_QUEUE" }],
    }),

    assignRiderOrder: builder.mutation<Order, string>({
      query: (orderId) => ({ url: `/riders/orders/${orderId}/assign`, method: "POST" }),
      invalidatesTags: (result, _error, orderId) => [
        { type: "Order", id: orderId },
        { type: "Order", id: "RIDER_QUEUE" },
        { type: "Order", id: "MY_DELIVERIES" },
      ],
    }),

    updateRiderOrderStatus: builder.mutation<Order, { orderId: string; status: OrderStatus }>({
      query: ({ orderId, status }) => ({
        url: `/riders/orders/${orderId}/status`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: (result, _error, { orderId }) => [
        { type: "Order", id: orderId },
        { type: "Order", id: "MY_DELIVERIES" },
      ],
    }),

    getMyDeliveries: builder.query<Order[], void>({
      query: () => "/riders/me/deliveries",
      providesTags: (result) =>
        result
          ? [...result.map((o) => ({ type: "Order" as const, id: o._id })), { type: "Order" as const, id: "MY_DELIVERIES" }]
          : [{ type: "Order", id: "MY_DELIVERIES" }],
    }),

    listAllRiders: builder.query<Rider[], void>({
      query: () => "/riders",
      providesTags: (result) =>
        result
          ? [...result.map((r) => ({ type: "Rider" as const, id: r._id })), { type: "Rider" as const, id: "LIST" }]
          : [{ type: "Rider", id: "LIST" }],
    }),

    verifyRider: builder.mutation<Rider, string>({
      query: (riderId) => ({ url: `/riders/${riderId}/verify`, method: "PATCH" }),
      invalidatesTags: (result, _error, riderId) => [
        { type: "Rider", id: riderId },
        { type: "Rider", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useApplyRiderMutation,
  useGetMyRiderProfileQuery,
  useToggleRiderOnlineMutation,
  useGetRiderQueueQuery,
  useAssignRiderOrderMutation,
  useUpdateRiderOrderStatusMutation,
  useGetMyDeliveriesQuery,
  useListAllRidersQuery,
  useVerifyRiderMutation,
} = ridersApi;
