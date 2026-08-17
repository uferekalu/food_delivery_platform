import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { RootState } from "./store";

/**
 * Single RTK Query instance for the whole app — every feature phase injects its own
 * endpoints via `api.injectEndpoints()` instead of creating a separate `createApi` call, so
 * there is one cache/tag graph rather than several disconnected ones.
 */
export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    // Sends/receives the httpOnly refresh_token cookie — see docs/ARCHITECTURE.md §11.
    credentials: "include",
    prepareHeaders: (headers, { getState }) => {
      const accessToken = (getState() as RootState).auth.accessToken;
      if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
      return headers;
    },
  }),
  tagTypes: [],
  endpoints: () => ({}),
});
