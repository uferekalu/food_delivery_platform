"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { FavoriteButton } from "@/components/favorite-button";
import { useListFavoritesQuery } from "@/lib/redux/services/account-api";

export function FavoritesTab() {
  const t = useTranslations("AccountPage");
  const { data: favorites, isLoading } = useListFavoritesQuery();

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!favorites || favorites.length === 0) {
    return (
      <EmptyState
        title={t("noFavoritesYet")}
        description={t("tapHeartToSave")}
        action={
          <Link href="/restaurants" className={buttonVariants({ variant: "primary" })}>
            {t("browseRestaurants")}
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {favorites.map((restaurant) => (
        <Card key={restaurant._id} className="relative h-full transition-colors duration-150 hover:border-border-strong">
          <FavoriteButton restaurantId={restaurant._id} className="absolute top-3 right-3 z-10" />
          <Link href={`/restaurants/${restaurant.slug}`} className="block h-full">
            <CardHeader>
              <CardTitle className="pr-10">{restaurant.name}</CardTitle>
              <CardDescription>
                {restaurant.cuisineTypes.join(", ")} • ⭐ {restaurant.avgRating.toFixed(1)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant={restaurant.isOpen ? "success" : "neutral"}>
                {restaurant.isOpen ? t("open") : t("closed")}
              </Badge>
            </CardContent>
          </Link>
        </Card>
      ))}
    </div>
  );
}
