import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FavoriteButton } from "@/components/favorite-button";
import type { Restaurant } from "@/lib/redux/restaurant-types";
import { describeOpenStatus, getOpenStatus } from "@/lib/opening-hours";

function priceLevelLabel(level: number): string {
  return "$".repeat(level);
}

export function PlateIcon({ className = "size-12" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="24" cy="24" r="19" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="11" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function RestaurantCard({
  restaurant,
  distanceKm,
}: {
  restaurant: Restaurant;
  /** "Restaurants near me" (docs/ROADMAP.md FDP-96) — only ever passed on the near-me page. */
  distanceKm?: number;
}) {
  const t = useTranslations("RestaurantCard");
  const locale = useLocale();
  const scheduleStatus = getOpenStatus(restaurant.openingHours, restaurant.country);
  const { label: openLabel, isOpenNow } = describeOpenStatus(restaurant.isOpen, scheduleStatus, locale, t);
  return (
    <Card className="relative h-full overflow-hidden transition-colors duration-150 hover:border-border-strong">
      <FavoriteButton restaurantId={restaurant._id} className="absolute top-3 right-3 z-10" />
      <Link href={`/restaurants/${restaurant.slug}`} className="block h-full">
        <div className="relative h-36 w-full bg-secondary">
          {restaurant.coverUrl ? (
            // A restaurant card photo doesn't warrant next/image's layout machinery here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-muted">
              <PlateIcon className="size-10" />
            </div>
          )}
          {restaurant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={restaurant.logoUrl}
              alt=""
              className="absolute -bottom-5 left-4 size-12 rounded-full border-2 border-surface object-cover shadow-sm"
            />
          )}
        </div>
        <CardHeader className={restaurant.logoUrl ? "pt-8" : undefined}>
          <CardTitle>{restaurant.name}</CardTitle>
          <CardDescription>
            {restaurant.cuisineTypes.join(", ")} • ⭐ {restaurant.avgRating.toFixed(1)} •{" "}
            {priceLevelLabel(restaurant.priceLevel)}
            {restaurant.estimatedDeliveryMinutes
              ? ` • ${t("estimatedMinutes", { minutes: restaurant.estimatedDeliveryMinutes })}`
              : ""}
            {distanceKm != null ? ` • ${t("distanceAway", { distance: distanceKm })}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant={isOpenNow ? "success" : "neutral"}>{openLabel}</Badge>
          {restaurant.cuisineTypes.slice(0, 3).map((cuisine) => (
            <Badge key={cuisine} variant="primary">
              {cuisine}
            </Badge>
          ))}
        </CardContent>
      </Link>
    </Card>
  );
}
