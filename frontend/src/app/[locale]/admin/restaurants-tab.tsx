"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useListAllRestaurantsForAdminQuery } from "@/lib/redux/services/restaurants-api";
import type { Restaurant } from "@/lib/redux/restaurant-types";

type ApprovalFilter = "" | "approved" | "pending";

function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const t = useTranslations("AdminRestaurantsTab");
  const locale = useLocale();

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="text-sm font-medium text-text">{restaurant.name}</span>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={restaurant.isApproved ? "success" : "warning"}>
              {restaurant.isApproved ? t("approved") : t("pendingApproval")}
            </Badge>
            <Badge variant={restaurant.isOpen ? "success" : "neutral"}>
              {restaurant.isOpen ? t("open") : t("closed")}
            </Badge>
            {restaurant.isSponsored && <Badge variant="primary">{t("sponsored")}</Badge>}
          </div>
        </div>
        <span className="text-sm text-text-muted">
          {restaurant.cuisineTypes.join(", ")} · {restaurant.currency} · {restaurant.address.city},{" "}
          {restaurant.address.state}
        </span>
        <span className="text-xs text-text-muted">
          ⭐ {restaurant.avgRating.toFixed(1)} ({t("reviewCount", { count: restaurant.reviewCount })}) ·{" "}
          {t("applied", { date: new Date(restaurant.createdAt).toLocaleDateString(locale) })}
        </span>
        <Link
          href={`/admin/restaurants/${restaurant._id}`}
          className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}
        >
          {restaurant.isApproved ? t("viewDetails") : t("reviewAndApprove")}
        </Link>
      </CardContent>
    </Card>
  );
}

export function RestaurantsTab() {
  const t = useTranslations("AdminRestaurantsTab");
  const [search, setSearch] = useState("");
  const [approval, setApproval] = useState<ApprovalFilter>("");
  const { data, isLoading } = useListAllRestaurantsForAdminQuery();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState title={t("noRestaurantsYet")} description={t("newApplicationsShowUpHere")} />;
  }

  const query = search.trim().toLowerCase();
  const filtered = data
    .filter((r) => (query ? r.name.toLowerCase().includes(query) : true))
    .filter((r) => {
      if (approval === "approved") return r.isApproved;
      if (approval === "pending") return !r.isApproved;
      return true;
    })
    // Pending-approval restaurants need attention first.
    .sort((a, b) => Number(a.isApproved) - Number(b.isApproved));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <Select
          options={[
            { value: "", label: t("allStatuses") },
            { value: "approved", label: t("approved") },
            { value: "pending", label: t("pendingApproval") },
          ]}
          value={approval}
          onChange={(v) => setApproval(v as ApprovalFilter)}
          className="w-48"
          aria-label={t("filterByStatus")}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t("noRestaurantsFound")} description={t("tryDifferentFilters")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((restaurant) => (
            <RestaurantCard key={restaurant._id} restaurant={restaurant} />
          ))}
        </div>
      )}
    </div>
  );
}
