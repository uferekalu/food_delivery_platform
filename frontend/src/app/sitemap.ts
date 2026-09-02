import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
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

// English is unprefixed (localePrefix: "as-needed"), French lives under /fr — every in-scope
// route needs both language variants listed via hreflang alternates so search engines serve the
// right locale instead of indexing only the default one (docs/ROADMAP.md FDP-55).
function localizedEntry(
  path: string,
  options: Pick<MetadataRoute.Sitemap[number], "changeFrequency" | "priority">,
): MetadataRoute.Sitemap[number] {
  const languages = Object.fromEntries(
    routing.locales.map((locale) => [locale, locale === routing.defaultLocale ? `${SITE_URL}${path}` : `${SITE_URL}/${locale}${path}`]),
  );
  return {
    url: `${SITE_URL}${path}`,
    alternates: { languages },
    ...options,
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    localizedEntry("", { changeFrequency: "daily", priority: 1 }),
    localizedEntry("/restaurants", { changeFrequency: "hourly", priority: 0.9 }),
    localizedEntry("/register", { changeFrequency: "monthly", priority: 0.3 }),
    localizedEntry("/login", { changeFrequency: "monthly", priority: 0.3 }),
  ];

  const slugs = await fetchAllApprovedSlugs();
  const restaurantRoutes: MetadataRoute.Sitemap = slugs.map((slug) =>
    localizedEntry(`/restaurants/${slug}`, { changeFrequency: "daily", priority: 0.7 }),
  );

  return [...staticRoutes, ...restaurantRoutes];
}
