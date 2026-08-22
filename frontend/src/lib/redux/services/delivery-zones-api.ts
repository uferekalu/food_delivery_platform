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
  }),
});

export const {
  useGetDeliveryZonesQuery,
  useCreateDeliveryZoneMutation,
  useUpdateDeliveryZoneMutation,
  useDeleteDeliveryZoneMutation,
} = deliveryZonesApi;
