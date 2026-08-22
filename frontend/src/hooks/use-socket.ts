"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Socket } from "socket.io-client";
import { useAppSelector } from "@/lib/redux/hooks";
import { ensureSocket, getSocketSnapshot, subscribeToSocket } from "@/lib/socket";

/** The shared realtime connection (docs/ARCHITECTURE.md §9) — null while logged out or before
 * the socket has connected. Callers still need to join the specific room they care about
 * (`socket.emit("order:subscribe", { orderId })` / `"restaurant:subscribe"`).
 *
 * `ensureSocket` (a plain function, not a React state setter) does the actual connect/replace
 * side effect; this hook only subscribes to its result via `useSyncExternalStore` — mirrors
 * `useSystemPrefersDark` in lib/theme.ts, the established pattern here for external-system
 * state that plain `useState`-in-effect would trigger the React Compiler's
 * `set-state-in-effect` rule on (see frontend/CLAUDE.md). */
export function useSocket(): Socket | null {
  const accessToken = useAppSelector((state) => state.auth.accessToken);

  useEffect(() => {
    ensureSocket(accessToken);
  }, [accessToken]);

  return useSyncExternalStore(subscribeToSocket, getSocketSnapshot, () => null);
}
