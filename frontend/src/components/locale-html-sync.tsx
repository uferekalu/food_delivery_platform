"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";

/**
 * Keeps `<html lang>` in sync with the active locale. The `<html>` tag has to live in the true
 * root `app/layout.tsx` (Next.js allows exactly one), which — unlike `app/[locale]/layout.tsx`
 * — never re-renders on a client-side navigation that only changes the locale segment
 * (docs/ROADMAP.md FDP-70), so its `lang` attribute would otherwise stay stuck at whatever
 * locale the page was first loaded with. This runs inside the per-navigation locale provider
 * instead, where `useLocale()` is always current.
 */
export function LocaleHtmlSync() {
  const locale = useLocale();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
