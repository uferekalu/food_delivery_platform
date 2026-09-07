import { api } from "../api";

// Support chat widget (docs/ROADMAP.md FDP-106) — mirrors the backend's own shapes exactly
// (backend/src/chatbot/chatbot.service.ts, backend/src/chatbot/schemas/chat-message.schema.ts).
export interface AskChatbotResult {
  answer: string;
  matched: boolean;
  ticketId?: string;
}

export interface ChatMessageRecord {
  _id: string;
  userId: string | null;
  sessionId: string | null;
  message: string;
  answer: string;
  matched: boolean;
  createdAt: string;
  updatedAt: string;
}

export const chatbotApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // @Public() + OptionalJwtAuthGuard on the backend (see that guard's own doc comment) — this
    // still goes through the normal authenticated `api` baseQuery when a token exists (it's
    // attached automatically like every other request), but works with no token too.
    askChatbot: builder.mutation<AskChatbotResult, { message: string; sessionId?: string }>({
      query: (body) => ({ url: "/chatbot/ask", method: "POST", body }),
    }),

    getChatHistory: builder.query<ChatMessageRecord[], { sessionId?: string } | void>({
      query: (params) => {
        const sessionId = params && "sessionId" in params ? params.sessionId : undefined;
        return `/chatbot/history${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`;
      },
    }),
  }),
});

export const { useAskChatbotMutation, useGetChatHistoryQuery, useLazyGetChatHistoryQuery } =
  chatbotApi;
