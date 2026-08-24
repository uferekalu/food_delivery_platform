import type { MetadataRoute } from "next";
import type { Restaurant } from "@/lib/redux/restaurant-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Only every approved restaurant is a real, publicly-indexable page — the same rule
// `RestaurantsService.findAllApproved`/`findBySlug` already enforce (docs/ROADMAP.md FDP-21).
async function fetchAllApprovedSlugs(): Promise<string[]> {
  const slugs: string[] = [];
  let page = 1;
  const limit = 50;

  try {
    while (true) {
      const res = await fetch(`${API_URL}/restaurants?page=${page}&limit=${limit}`, {
        next: { revalidate: 3600 },
      });
      if (!res.ok) break;
      const data = (await res.json()) as { items: Restaurant[]; totalPages: number };
      slugs.push(...data.items.map((r) => r.slug));
      if (page >= data.totalPages) break;
      page += 1;
    }
  } catch {
    // A sitemap missing restaurant pages is far better than a build/request failing outright.
  }

  return slugs;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/restaurants`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/register`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 0.3 },
  ];

  const slugs = await fetchAllApprovedSlugs();
  const restaurantRoutes: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `${SITE_URL}/restaurants/${slug}`,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [...staticRoutes, ...restaurantRoutes];
}
