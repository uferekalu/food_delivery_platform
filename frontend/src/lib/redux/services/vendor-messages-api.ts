import { api } from "../api";
import type { PaginatedResult } from "../restaurant-types";

// Admin<->vendor messaging (docs/ROADMAP.md FDP-108) — a real two-way conversation thread, one
// per vendor user, worked by "admin" as a role rather than a specific admin (mirrors the
// support-tickets convention). Mirrors backend/src/vendor-messages/ shapes exactly.
export const VENDOR_MESSAGE_SENDER_ROLES = ["admin", "restaurant_owner"] as const;
export type VendorMessageSenderRole = (typeof VENDOR_MESSAGE_SENDER_ROLES)[number];

export interface VendorMessage {
  _id: string;
  vendorId: string;
  senderId: string;
  senderRole: VendorMessageSenderRole;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface VendorConversation {
  vendorId: string;
  vendorName: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastSenderRole: VendorMessageSenderRole;
  unreadByAdmin: number;
  unreadByVendor: number;
}

export const vendorMessagesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Vendor's own thread.
    getVendorMessages: builder.query<VendorMessage[], void>({
      query: () => "/vendor-messages",
      providesTags: [{ type: "VendorMessage", id: "MINE" }],
    }),

    sendVendorMessage: builder.mutation<VendorMessage, { body: string }>({
      query: (body) => ({ url: "/vendor-messages", method: "POST", body }),
      invalidatesTags: [{ type: "VendorMessage", id: "MINE" }],
    }),

    markVendorMessagesRead: builder.mutation<void, void>({
      query: () => ({ url: "/vendor-messages/read", method: "PATCH" }),
    }),

    // Admin side — any vendor's thread.
    listVendorConversations: builder.query<
      PaginatedResult<VendorConversation>,
      { page?: number; limit?: number } | void
    >({
      query: (params) => {
        const search = new URLSearchParams();
        search.set("page", String(params?.page ?? 1));
        search.set("limit", String(params?.limit ?? 20));
        return `/admin/vendor-conversations?${search.toString()}`;
      },
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((c) => ({ type: "VendorConversation" as const, id: c.vendorId })),
              { type: "VendorConversation" as const, id: "LIST" },
            ]
          : [{ type: "VendorConversation", id: "LIST" }],
    }),

    getVendorConversationMessages: builder.query<VendorMessage[], string>({
      query: (vendorId) => `/admin/vendor-conversations/${vendorId}/messages`,
      providesTags: (_result, _error, vendorId) => [{ type: "VendorMessage", id: vendorId }],
    }),

    sendAdminVendorMessage: builder.mutation<VendorMessage, { vendorId: string; body: string }>({
      query: ({ vendorId, body }) => ({
        url: `/admin/vendor-conversations/${vendorId}/messages`,
        method: "POST",
        body: { body },
      }),
      invalidatesTags: (_result, _error, { vendorId }) => [
        { type: "VendorMessage", id: vendorId },
        { type: "VendorConversation", id: "LIST" },
      ],
    }),

    markVendorConversationRead: builder.mutation<void, string>({
      query: (vendorId) => ({ url: `/admin/vendor-conversations/${vendorId}/read`, method: "PATCH" }),
      invalidatesTags: (_result, _error, vendorId) => [
        { type: "VendorConversation", id: vendorId },
        { type: "VendorConversation", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetVendorMessagesQuery,
  useSendVendorMessageMutation,
  useMarkVendorMessagesReadMutation,
  useListVendorConversationsQuery,
  useGetVendorConversationMessagesQuery,
  useSendAdminVendorMessageMutation,
  useMarkVendorConversationReadMutation,
} = vendorMessagesApi;
