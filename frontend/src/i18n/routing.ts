import { defineRouting } from "next-intl/routing";

// English unprefixed (/restaurants), every other language under its own /<locale>/... prefix
// (docs/ROADMAP.md FDP-55/FDP-70) — matches this platform's existing SEO focus (FDP-21):
// distinct, shareable, indexable URLs per language rather than a same-URL cookie-based switch.
export const routing = defineRouting({
  locales: ["en", "fr", "es", "pt", "de", "zh"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];
