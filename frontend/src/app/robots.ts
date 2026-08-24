import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Account/checkout/order-history pages have no SEO value and are behind auth anyway.
        disallow: ["/account", "/checkout", "/orders", "/dashboard", "/admin", "/rider"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
