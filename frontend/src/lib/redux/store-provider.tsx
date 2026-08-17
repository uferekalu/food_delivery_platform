"use client";

import { useRef, type ReactNode } from "react";
import { Provider } from "react-redux";
import { makeStore, type AppStore } from "./store";

export function StoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = makeStore();
  }

  // Redux Toolkit's documented Next.js App Router pattern: a lazily-created, per-mount store
  // ref (guarded above) is required so each request/session gets its own store instead of one
  // shared across users on the server. Safe because the read always follows the synchronous
  // guard on the same render.
  // eslint-disable-next-line react-hooks/refs
  return <Provider store={storeRef.current}>{children}</Provider>;
}
