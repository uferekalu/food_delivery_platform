import { api } from "../api";

// Support chat widget (docs/ROADMAP.md FDP-106) — admin-only management of the FAQ entries the
// chatbot matches against (backend/src/knowledge-base/).
export interface KnowledgeBaseEntry {
  _id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseEntryInput {
  question: string;
  answer: string;
  keywords: string[];
  category: string;
  isActive?: boolean;
}

export const knowledgeBaseApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listKnowledgeBaseEntries: builder.query<KnowledgeBaseEntry[], void>({
      query: () => "/knowledge-base",
      providesTags: (result) =>
        result
          ? [
              ...result.map((e) => ({ type: "KnowledgeBaseEntry" as const, id: e._id })),
              { type: "KnowledgeBaseEntry" as const, id: "LIST" },
            ]
          : [{ type: "KnowledgeBaseEntry", id: "LIST" }],
    }),

    createKnowledgeBaseEntry: builder.mutation<KnowledgeBaseEntry, KnowledgeBaseEntryInput>({
      query: (body) => ({ url: "/knowledge-base", method: "POST", body }),
      invalidatesTags: [{ type: "KnowledgeBaseEntry", id: "LIST" }],
    }),

    updateKnowledgeBaseEntry: builder.mutation<
      KnowledgeBaseEntry,
      { id: string; body: Partial<KnowledgeBaseEntryInput> }
    >({
      query: ({ id, body }) => ({ url: `/knowledge-base/${id}`, method: "PATCH", body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "KnowledgeBaseEntry", id },
        { type: "KnowledgeBaseEntry", id: "LIST" },
      ],
    }),

    deleteKnowledgeBaseEntry: builder.mutation<void, string>({
      query: (id) => ({ url: `/knowledge-base/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "KnowledgeBaseEntry", id: "LIST" }],
    }),
  }),
});

export const {
  useListKnowledgeBaseEntriesQuery,
  useCreateKnowledgeBaseEntryMutation,
  useUpdateKnowledgeBaseEntryMutation,
  useDeleteKnowledgeBaseEntryMutation,
} = knowledgeBaseApi;
