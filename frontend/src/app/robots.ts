import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Account/checkout/order-history pages have no SEO value and are behind auth anyway.
        // /design-system is the internal hand-built UI kit showcase (FDP-2) — never customer
        // content, was only ever meant for the team's own reference. The /fr variants need their
        // own entries since French lives under its own path prefix (docs/ROADMAP.md FDP-55).
        disallow: [
          "/account",
          "/checkout",
          "/orders",
          "/dashboard",
          "/admin",
          "/rider",
          "/design-system",
          "/fr/account",
          "/fr/checkout",
          "/fr/orders",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
