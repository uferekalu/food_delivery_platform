import type { FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import type { SerializedError } from "@reduxjs/toolkit";

interface BackendErrorBody {
  message?: string | string[];
}

function isFetchBaseQueryError(error: unknown): error is FetchBaseQueryError {
  return typeof error === "object" && error !== null && "status" in error;
}

/** Extracts a user-displayable message from an RTK Query mutation/query error. */
export function getErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;

  if (isFetchBaseQueryError(error)) {
    const data = error.data as BackendErrorBody | undefined;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join(", ") : data.message;
    }
    if (error.status === "FETCH_ERROR") return "Couldn't reach the server. Check your connection.";
    return fallback;
  }

  const serialized = error as SerializedError;
  return serialized.message ?? fallback;
}
