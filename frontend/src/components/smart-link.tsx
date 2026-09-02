import NextLink from "next/link";
import { Link as LocaleLink } from "@/i18n/navigation";
import type { ComponentProps } from "react";

const OUT_OF_SCOPE_PREFIXES = ["/dashboard", "/admin", "/rider"];

function isOutOfScope(href: string): boolean {
  return OUT_OF_SCOPE_PREFIXES.some((prefix) => href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`));
}

/**
 * Picks the correct Link implementation for a given href (docs/ROADMAP.md FDP-55) —
 * dashboard/admin/rider routes deliberately aren't under app/[locale] yet (customer-facing-first
 * scope), so they must never get a locale prefix; every other route should. A handful of
 * components link to both kinds depending on runtime state (e.g. the footer/homepage's
 * role-based CTAs) — this centralizes the choice so those call sites don't have to reason about
 * it, and a future i18n ticket that moves dashboard/admin/rider under [locale] only needs to
 * update the prefix list here, not every call site.
 */
export function SmartLink({ href, locale, ...props }: ComponentProps<typeof NextLink>) {
  const hrefStr = typeof href === "string" ? href : (href.pathname ?? "");
  return isOutOfScope(hrefStr) ? (
    <NextLink href={href} locale={locale} {...props} />
  ) : (
    // href is a plain in-scope string/UrlObject here; LocaleLink's typed-routes href type
    // doesn't need to be reconciled with NextLink's broader ComponentProps type for this
    // passthrough.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <LocaleLink href={href as any} {...props} />
  );
}
