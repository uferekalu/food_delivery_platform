import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FavoriteButton } from "@/components/favorite-button";
import { cn } from "@/lib/cn";
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
    <Card className="relative h-full overflow-hidden transition-shadow duration-150 hover:border-border-strong hover:shadow-md">
      <FavoriteButton restaurantId={restaurant._id} className="absolute top-2 right-2 z-10" />
      <Link href={`/restaurants/${restaurant.slug}`} className="block h-full">
        <div className="relative h-24 w-full bg-secondary sm:h-28">
          {restaurant.coverUrl ? (
            // A restaurant card photo doesn't warrant next/image's layout machinery here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-muted">
              <PlateIcon className="size-8" />
            </div>
          )}
          {restaurant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={restaurant.logoUrl}
              alt=""
              className="absolute -bottom-4 left-3 size-9 rounded-full border-2 border-surface object-cover shadow-sm"
            />
          )}
        </div>
        <CardHeader className={cn("gap-0.5 p-3", restaurant.logoUrl && "pt-6")}>
          <CardTitle className="truncate text-sm font-semibold">{restaurant.name}</CardTitle>
          <CardDescription className="truncate text-xs">
            {restaurant.cuisineTypes.slice(0, 2).join(", ")} • ⭐ {restaurant.avgRating.toFixed(1)} •{" "}
            {priceLevelLabel(restaurant.priceLevel)}
            {restaurant.estimatedDeliveryMinutes
              ? ` • ${t("estimatedMinutes", { minutes: restaurant.estimatedDeliveryMinutes })}`
              : ""}
            {distanceKm != null ? ` • ${t("distanceAway", { distance: distanceKm })}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-1.5 p-3 pt-2">
          {/* Sponsored listings (docs/ROADMAP.md FDP-126) — leads the badge row, ahead of even
              open/closed, matching how Glovo/Chowdeck both lead a boosted card with its
              sponsorship label as the single most prominent badge. */}
          {restaurant.isSponsored && <Badge variant="warning">{t("sponsored")}</Badge>}
          <Badge variant={isOpenNow ? "success" : "neutral"}>{openLabel}</Badge>
          {restaurant.cuisineTypes.slice(0, 1).map((cuisine) => (
            <Badge key={cuisine} variant="primary">
              {cuisine}
            </Badge>
          ))}
        </CardContent>
      </Link>
    </Card>
  );
}
