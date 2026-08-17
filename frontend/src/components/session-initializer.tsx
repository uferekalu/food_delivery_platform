"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useRefreshMutation } from "@/lib/redux/services/auth-api";
import { clearSession } from "@/lib/redux/slices/auth-slice";

/**
 * Silently re-establishes a session from the httpOnly refresh cookie on first load — the
 * access token lives only in Redux memory (never localStorage, see docs/ARCHITECTURE.md §11),
 * so it's gone after a full page reload even though the refresh cookie is still valid.
 *
 * A failed refresh here is the normal outcome for an anonymous visitor, not an error — but it
 * still needs to move `status` out of "idle" and into "unauthenticated", otherwise UI can't
 * tell "still checking" apart from "confirmed signed out" and risks flashing the wrong state.
 */
export function SessionInitializer() {
  const dispatch = useAppDispatch();
  const status = useAppSelector((state) => state.auth.status);
  const [refresh] = useRefreshMutation();
  const attempted = useRef(false);

  useEffect(() => {
    if (status !== "idle" || attempted.current) return;
    attempted.current = true;
    refresh()
      .unwrap()
      .catch(() => dispatch(clearSession()));
  }, [status, refresh, dispatch]);

  return null;
}
