import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Restaurant } from "@/lib/redux/restaurant-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// `JSON.stringify` never escapes `<`, so a restaurant `name`/`description` containing
// `</script>` (self-registered vendors set both, with no content restrictions beyond a length
// cap — see `create-restaurant.dto.ts`) would close this script tag early and let the rest of
// its value execute as live HTML on every visitor's page. `<` is valid inside a JSON string
// and identical once parsed, so this is a pure serialization-safety escape, not a data change.
function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

// A plain server-side fetch (not RTK Query, which only runs client-side) — the page itself
// (`page.tsx`) stays a client component for its interactive cart/review/favorite state, but
// per-restaurant SEO metadata needs to exist before any client JS runs. Splitting it into this
// sibling `layout.tsx` (a server component) gets dynamic <title>/description/OG tags and JSON-LD
// without restructuring the existing client page (docs/ROADMAP.md FDP-21).
async function fetchRestaurant(slug: string): Promise<Restaurant | null> {
  try {
    const res = await fetch(`${API_URL}/restaurants/${slug}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as Restaurant;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const restaurant = await fetchRestaurant(slug);
  const t = await getTranslations("RestaurantDetailPage");
  if (!restaurant) return { title: t("restaurantNotFound") };

  const description =
    restaurant.description ||
    t("metaDescriptionFallback", { name: restaurant.name, cuisines: restaurant.cuisineTypes.join(", "), city: restaurant.address.city });

  return {
    title: restaurant.name,
    description,
    alternates: { canonical: `/restaurants/${restaurant.slug}` },
    openGraph: {
      title: restaurant.name,
      description,
      type: "website",
      ...(restaurant.coverUrl ? { images: [{ url: restaurant.coverUrl }] } : {}),
    },
    twitter: {
      card: restaurant.coverUrl ? "summary_large_image" : "summary",
      title: restaurant.name,
      description,
    },
  };
}

export default async function RestaurantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const restaurant = await fetchRestaurant(slug);

  return (
    <>
      {restaurant && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd({
              "@context": "https://schema.org",
              "@type": "Restaurant",
              name: restaurant.name,
              description: restaurant.description || undefined,
              image: restaurant.coverUrl || restaurant.logoUrl || undefined,
              servesCuisine: restaurant.cuisineTypes,
              priceRange: "$".repeat(restaurant.priceLevel),
              address: {
                "@type": "PostalAddress",
                streetAddress: restaurant.address.line1,
                addressLocality: restaurant.address.city,
                addressRegion: restaurant.address.state,
                addressCountry: restaurant.country,
              },
              ...(restaurant.reviewCount > 0
                ? {
                    aggregateRating: {
                      "@type": "AggregateRating",
                      ratingValue: restaurant.avgRating,
                      reviewCount: restaurant.reviewCount,
                    },
                  }
                : {}),
            }),
          }}
        />
      )}
      {children}
    </>
  );
}
