import { api } from "../api";
import type { PaginatedResult } from "../restaurant-types";

export const SUPPORT_TICKET_STATUSES = ["open", "resolved"] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export interface SupportTicket {
  _id: string;
  question: string;
  userId: string | null;
  sessionId: string | null;
  matchedEntryId: string | null;
  status: SupportTicketStatus;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const supportTicketsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listSupportTickets: builder.query<
      PaginatedResult<SupportTicket>,
      { status?: SupportTicketStatus; page?: number; limit?: number } | void
    >({
      query: (params) => {
        const search = new URLSearchParams();
        if (params?.status) search.set("status", params.status);
        search.set("page", String(params?.page ?? 1));
        search.set("limit", String(params?.limit ?? 20));
        return `/support-tickets?${search.toString()}`;
      },
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((t) => ({ type: "SupportTicket" as const, id: t._id })),
              { type: "SupportTicket" as const, id: "LIST" },
            ]
          : [{ type: "SupportTicket", id: "LIST" }],
    }),

    resolveSupportTicket: builder.mutation<SupportTicket, string>({
      query: (id) => ({ url: `/support-tickets/${id}/resolve`, method: "PATCH" }),
      invalidatesTags: (_result, _error, id) => [
        { type: "SupportTicket", id },
        { type: "SupportTicket", id: "LIST" },
      ],
    }),
  }),
});

export const { useListSupportTicketsQuery, useResolveSupportTicketMutation } = supportTicketsApi;
