import { api } from "../api";
import type { AdminUser, PaginatedResult } from "../restaurant-types";
import type { UserRole, UserStatus } from "@/lib/constants/roles";

export interface ListUsersParams {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  page?: number;
  limit?: number;
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const usersApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listUsers: builder.query<PaginatedResult<AdminUser>, ListUsersParams | void>({
      query: (params) => `/users${toQueryString({ ...params })}`,
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((u) => ({ type: "User" as const, id: u.id })),
              { type: "User" as const, id: "LIST" },
            ]
          : [{ type: "User" as const, id: "LIST" }],
    }),

    suspendUser: builder.mutation<AdminUser, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/users/${id}/suspend`, method: "PATCH", body: { reason } }),
      invalidatesTags: (result, _error, { id }) => [
        { type: "User", id },
        { type: "User", id: "LIST" },
        { type: "AdminAnalytics", id: "SUMMARY" },
      ],
    }),

    reactivateUser: builder.mutation<AdminUser, string>({
      query: (id) => ({ url: `/users/${id}/reactivate`, method: "PATCH" }),
      invalidatesTags: (result, _error, id) => [
        { type: "User", id },
        { type: "User", id: "LIST" },
        { type: "AdminAnalytics", id: "SUMMARY" },
      ],
    }),

    updateUserRole: builder.mutation<{ id: string; email: string; role: UserRole }, { id: string; role: UserRole }>({
      query: ({ id, role }) => ({ url: `/users/${id}/role`, method: "PATCH", body: { role } }),
      invalidatesTags: (result, _error, { id }) => [
        { type: "User", id },
        { type: "User", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListUsersQuery,
  useSuspendUserMutation,
  useReactivateUserMutation,
  useUpdateUserRoleMutation,
} = usersApi;
