"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setThemeMode } from "@/lib/redux/slices/theme-slice";
import { applyThemeToDom, readStoredThemeMode, THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Bridges the pre-hydration inline script (`THEME_BOOTSTRAP_SCRIPT`, which already set
 * `data-theme` on `<html>` before React loaded) with Redux, then keeps the DOM attribute +
 * localStorage in sync with the store for every subsequent change. Renders nothing.
 */
export function ThemeInitializer() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.theme.mode);
  const isFirstEffect = useRef(true);

  useEffect(() => {
    // One-time: hydrate Redux from the value the bootstrap script already read. The DOM
    // itself is already correct (set by that script) — this only syncs the store's copy.
    dispatch(setThemeMode(readStoredThemeMode()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isFirstEffect.current) {
      // Skip on mount: the DOM already reflects the correct theme via the bootstrap script.
      // Re-applying here with the pre-hydration default `mode` would flash the wrong theme
      // for a frame before the effect above's dispatch catches up.
      isFirstEffect.current = false;
      return;
    }
    applyThemeToDom(mode);
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  }, [mode]);

  return null;
}
