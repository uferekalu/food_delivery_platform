import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Account/checkout/order-history/dashboard/admin/rider pages have no SEO value and are behind
// auth anyway. Each lives under app/[locale], so it exists at every locale's prefix (English
// unprefixed, every other locale under /<locale>/... — see i18n/routing.ts) and needs a
// disallow entry per locale, not just the default. /design-system is the one route tree that
// stays out of the locale system entirely (internal hand-built UI kit showcase, FDP-2) — it
// only ever exists at its single unprefixed path.
const GATED_PATHS = ["/account", "/checkout", "/orders", "/dashboard", "/admin", "/rider"];

export default function robots(): MetadataRoute.Robots {
  const gatedDisallow = GATED_PATHS.flatMap((path) =>
    routing.locales.map((locale) => (locale === routing.defaultLocale ? path : `/${locale}${path}`)),
  );

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...gatedDisallow, "/design-system"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
