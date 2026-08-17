import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

/**
 * Single RTK Query instance for the whole app — every feature phase injects its own
 * endpoints via `api.injectEndpoints()` instead of creating a separate `createApi` call, so
 * there is one cache/tag graph rather than several disconnected ones.
 */
export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    credentials: "include",
  }),
  tagTypes: [],
  endpoints: () => ({}),
});
