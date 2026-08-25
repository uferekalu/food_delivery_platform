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
        // content, was only ever meant for the team's own reference.
        disallow: ["/account", "/checkout", "/orders", "/dashboard", "/admin", "/rider", "/design-system"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
