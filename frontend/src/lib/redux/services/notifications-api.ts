import { api } from "../api";
import type { Notification, PaginatedResult } from "../restaurant-types";

export interface ListNotificationsParams {
  page?: number;
  limit?: number;
}

const LIST_TAG = { type: "Notification" as const, id: "LIST" };
const UNREAD_COUNT_TAG = { type: "Notification" as const, id: "UNREAD_COUNT" };

function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const notificationsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listNotifications: builder.query<PaginatedResult<Notification>, ListNotificationsParams | void>({
      query: (params) => `/notifications${toQueryString({ page: params?.page, limit: params?.limit })}`,
      providesTags: [LIST_TAG],
    }),

    getUnreadNotificationCount: builder.query<{ count: number }, void>({
      query: () => "/notifications/unread-count",
      providesTags: [UNREAD_COUNT_TAG],
    }),

    markNotificationRead: builder.mutation<Notification, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: "PATCH" }),
      invalidatesTags: [LIST_TAG, UNREAD_COUNT_TAG],
    }),

    markAllNotificationsRead: builder.mutation<{ success: boolean }, void>({
      query: () => ({ url: "/notifications/read-all", method: "PATCH" }),
      invalidatesTags: [LIST_TAG, UNREAD_COUNT_TAG],
    }),
  }),
});

export const {
  useListNotificationsQuery,
  useGetUnreadNotificationCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = notificationsApi;
