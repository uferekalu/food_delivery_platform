import { api } from "../api";
import type { DeliveryZone } from "../restaurant-types";

export interface DeliveryZoneInput {
  name: string;
  maxDistanceKm: number;
  baseFee: number;
  perKmFee?: number;
  isActive?: boolean;
}

export const deliveryZonesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getDeliveryZones: builder.query<DeliveryZone[], string>({
      query: (restaurantId) => `/restaurants/${restaurantId}/delivery-zones`,
      providesTags: (_result, _error, restaurantId) => [{ type: "DeliveryZone", id: restaurantId }],
    }),

    createDeliveryZone: builder.mutation<DeliveryZone, { restaurantId: string; body: DeliveryZoneInput }>({
      query: ({ restaurantId, body }) => ({
        url: `/restaurants/${restaurantId}/delivery-zones`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { restaurantId }) => [{ type: "DeliveryZone", id: restaurantId }],
    }),

    updateDeliveryZone: builder.mutation<
      DeliveryZone,
      { restaurantId: string; zoneId: string; body: Partial<DeliveryZoneInput> }
    >({
      query: ({ restaurantId, zoneId, body }) => ({
        url: `/restaurants/${restaurantId}/delivery-zones/${zoneId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { restaurantId }) => [{ type: "DeliveryZone", id: restaurantId }],
    }),

    deleteDeliveryZone: builder.mutation<void, { restaurantId: string; zoneId: string }>({
      query: ({ restaurantId, zoneId }) => ({
        url: `/restaurants/${restaurantId}/delivery-zones/${zoneId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { restaurantId }) => [{ type: "DeliveryZone", id: restaurantId }],
    }),

    // Store (grocery/pharmacy) counterparts (docs/ROADMAP.md FDP-90) — same shape, different
    // route, kept as separate endpoints rather than a shared parameterized one since the two
    // pages calling them (dashboard/restaurants/[id]/delivery-zones vs.
    // dashboard/stores/[id]/delivery-zones) already have distinct id params in scope.
    getStoreDeliveryZones: builder.query<DeliveryZone[], string>({
      query: (storeId) => `/stores/${storeId}/delivery-zones`,
      providesTags: (_result, _error, storeId) => [{ type: "DeliveryZone", id: storeId }],
    }),

    createStoreDeliveryZone: builder.mutation<DeliveryZone, { storeId: string; body: DeliveryZoneInput }>({
      query: ({ storeId, body }) => ({
        url: `/stores/${storeId}/delivery-zones`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: "DeliveryZone", id: storeId }],
    }),

    updateStoreDeliveryZone: builder.mutation<
      DeliveryZone,
      { storeId: string; zoneId: string; body: Partial<DeliveryZoneInput> }
    >({
      query: ({ storeId, zoneId, body }) => ({
        url: `/stores/${storeId}/delivery-zones/${zoneId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: "DeliveryZone", id: storeId }],
    }),

    deleteStoreDeliveryZone: builder.mutation<void, { storeId: string; zoneId: string }>({
      query: ({ storeId, zoneId }) => ({
        url: `/stores/${storeId}/delivery-zones/${zoneId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: "DeliveryZone", id: storeId }],
    }),
  }),
});

export const {
  useGetDeliveryZonesQuery,
  useCreateDeliveryZoneMutation,
  useUpdateDeliveryZoneMutation,
  useDeleteDeliveryZoneMutation,
  useGetStoreDeliveryZonesQuery,
  useCreateStoreDeliveryZoneMutation,
  useUpdateStoreDeliveryZoneMutation,
  useDeleteStoreDeliveryZoneMutation,
} = deliveryZonesApi;
