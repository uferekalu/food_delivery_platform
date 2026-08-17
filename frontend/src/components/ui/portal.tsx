"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noopSubscribe = () => () => {};

/** True only once mounted on the client — avoids setState-in-effect and SSR/CSR mismatches. */
function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Renders children into `document.body`, after mount, to escape clipping/stacking contexts. */
export function Portal({ children }: { children: ReactNode }) {
  const mounted = useMounted();

  if (!mounted) return null;
  return createPortal(children, document.body);
}
