import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import { Mutex } from "async-mutex";
import type { RootState } from "./store";
import { clearSession, setSession } from "./slices/auth-slice";
import type { AuthResponse } from "./types";

/**
 * Endpoints where a 401 means "actually not authenticated" (wrong credentials, or a dead
 * refresh cookie) rather than "access token expired mid-session" — retrying through the reauth
 * flow there would either loop forever (`/auth/refresh` calling itself) or waste a round trip
 * retrying a login/register that will just fail again unchanged.
 */
const AUTH_BOOTSTRAP_PATHS = new Set(["/auth/login", "/auth/register", "/auth/refresh"]);

function requestUrl(args: string | FetchArgs): string {
  return typeof args === "string" ? args : args.url;
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  // Sends/receives the httpOnly refresh_token cookie — see docs/ARCHITECTURE.md §11.
  credentials: "include",
  prepareHeaders: (headers, { getState }) => {
    const accessToken = (getState() as RootState).auth.accessToken;
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    return headers;
  },
});

// Serializes concurrent 401s so simultaneous in-flight queries don't each fire their own
// `/auth/refresh` call — the standard RTK Query "automatic re-authentication" pattern (see RTK
// Query's own cookbook docs). Without this, an access token expiring while several widgets are
// fetching at once would race N separate refreshes against the single-use rotating refresh
// token (see docs/ARCHITECTURE.md §11), and all but the first would fail.
const mutex = new Mutex();

/**
 * Access tokens are short-lived (~15 min, docs/ARCHITECTURE.md §11) by design — without this
 * wrapper, any query issued after expiry would surface as a bare 401 to whatever component
 * triggered it, silently breaking the app for anyone still on the same page past that window.
 * This makes token expiry invisible to the rest of the app: on a 401, silently refresh via the
 * httpOnly cookie and retry the original request once; only clear the session (→ redirected to
 * a logged-out state) if the refresh itself fails, meaning the refresh token is genuinely gone.
 */
const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  await mutex.waitForUnlock();
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401 && !AUTH_BOOTSTRAP_PATHS.has(requestUrl(args))) {
    if (!mutex.isLocked()) {
      const release = await mutex.acquire();
      try {
        const refreshResult = await rawBaseQuery({ url: "/auth/refresh", method: "POST" }, api, extraOptions);
        if (refreshResult.data) {
          api.dispatch(setSession(refreshResult.data as AuthResponse));
          result = await rawBaseQuery(args, api, extraOptions);
        } else {
          api.dispatch(clearSession());
        }
      } finally {
        release();
      }
    } else {
      // Someone else is already refreshing — wait for it, then retry once against whatever
      // session ends up in the store (a fresh token if it succeeded, none if it didn't).
      await mutex.waitForUnlock();
      result = await rawBaseQuery(args, api, extraOptions);
    }
  }

  return result;
};

/**
 * Single RTK Query instance for the whole app — every feature phase injects its own
 * endpoints via `api.injectEndpoints()` instead of creating a separate `createApi` call, so
 * there is one cache/tag graph rather than several disconnected ones.
 */
export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "Restaurant",
    "MyRestaurants",
    "Menu",
    "Cart",
    "Order",
    "SavedAddress",
    "Favorite",
    "DeliveryZone",
    "Rider",
    "Review",
    "Notification",
    "PromoCode",
    "AdminAnalytics",
  ],
  endpoints: () => ({}),
});
