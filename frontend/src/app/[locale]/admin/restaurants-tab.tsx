"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useListPendingRestaurantsQuery } from "@/lib/redux/services/restaurants-api";
import type { Restaurant } from "@/lib/redux/restaurant-types";

function PendingRestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const t = useTranslations("AdminRestaurantsTab");
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">{restaurant.name}</span>
          <span className="text-sm text-text-muted">
            {restaurant.cuisineTypes.join(", ")} · {restaurant.currency} · {restaurant.address.city},{" "}
            {restaurant.address.state}
          </span>
        </div>
        {/* No direct "Approve" here — an admin needs to see the restaurant's actual menu
            before approving it, not just this summary card, or an owner can get approved
            with no menu items at all. The review page has the approve action. */}
        <Link
          href={`/admin/restaurants/${restaurant._id}`}
          className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}
        >
          {t("reviewAndApprove")}
        </Link>
      </CardContent>
    </Card>
  );
}

export function RestaurantsTab() {
  const t = useTranslations("AdminRestaurantsTab");
  const { data, isLoading } = useListPendingRestaurantsQuery();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState title={t("noRestaurantsAwaitingApproval")} description={t("newApplicationsShowUpHere")} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((restaurant) => (
        <PendingRestaurantCard key={restaurant._id} restaurant={restaurant} />
      ))}
    </div>
  );
}
