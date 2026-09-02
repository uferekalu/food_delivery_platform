import { defineRouting } from "next-intl/routing";

// English unprefixed (/restaurants), French under /fr/... (docs/ROADMAP.md FDP-55) — matches
// this platform's existing SEO focus (FDP-21): distinct, shareable, indexable URLs per language
// rather than a same-URL cookie-based switch.
export const routing = defineRouting({
  locales: ["en", "fr"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];
