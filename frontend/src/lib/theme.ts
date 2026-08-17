"use client";

import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "theme";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function readStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : "system";
}

/** Applies the resolved DOM state for a theme mode: explicit modes force `data-theme`, `system` removes it so `prefers-color-scheme` alone decides. */
export function applyThemeToDom(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

/**
 * Raw source for the pre-hydration inline script in the root layout — kept here so the
 * no-FOUC bootstrap logic and the client-side logic above can't drift apart. Must stay
 * dependency-free (runs before any bundle loads).
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var m=localStorage.getItem('${THEME_STORAGE_KEY}');if(m!=='light'&&m!=='dark'&&m!=='system')m='system';if(m!=='system'){document.documentElement.setAttribute('data-theme',m);}}catch(e){}})();`;

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystemTheme(callback: () => void) {
  const mql = window.matchMedia(MEDIA_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSystemPrefersDark() {
  return window.matchMedia(MEDIA_QUERY).matches;
}

/** Live-updating read of the OS-level dark mode preference (for UI display, e.g. which icon to show for "system"). */
export function useSystemPrefersDark() {
  return useSyncExternalStore(subscribeToSystemTheme, getSystemPrefersDark, () => false);
}
