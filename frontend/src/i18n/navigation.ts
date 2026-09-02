import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware Link/useRouter/usePathname/redirect (docs/ROADMAP.md FDP-55) — drop-in
// replacements for next/link and next/navigation's equivalents that automatically carry the
// current locale prefix. Every customer-facing page/component uses these instead of the raw
// next/* imports; out-of-scope routes (dashboard/admin/rider) keep using next/link directly
// since they aren't under [locale] yet.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
