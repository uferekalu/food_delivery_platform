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
import { useListAllStoresForAdminQuery } from "@/lib/redux/services/stores-api";
import type { Store } from "@/lib/redux/restaurant-types";

type ApprovalFilter = "" | "approved" | "pending";

function StoreCard({ store }: { store: Store }) {
  const t = useTranslations("AdminStoresTab");
  const locale = useLocale();

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="text-sm font-medium text-text">{store.name}</span>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={store.isApproved ? "success" : "warning"}>
              {store.isApproved ? t("approved") : t("pendingApproval")}
            </Badge>
            <Badge variant={store.isOpen ? "success" : "neutral"}>
              {store.isOpen ? t("open") : t("closed")}
            </Badge>
            {store.isSponsored && <Badge variant="primary">{t("sponsored")}</Badge>}
          </div>
        </div>
        <span className="text-sm text-text-muted">
          {store.type === "groceries" ? t("groceries") : t("pharmacyBeauty")}
          {store.tags.length > 0 ? ` · ${store.tags.join(", ")}` : ""} · {store.currency} ·{" "}
          {store.address.city}, {store.address.state}
        </span>
        <span className="text-xs text-text-muted">
          ⭐ {store.avgRating.toFixed(1)} ({t("reviewCount", { count: store.reviewCount })}) ·{" "}
          {t("applied", { date: new Date(store.createdAt).toLocaleDateString(locale) })}
        </span>
        <Link
          href={`/admin/stores/${store._id}`}
          className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}
        >
          {store.isApproved ? t("viewDetails") : t("reviewAndApprove")}
        </Link>
      </CardContent>
    </Card>
  );
}

export function StoresTab() {
  const t = useTranslations("AdminStoresTab");
  const [search, setSearch] = useState("");
  const [approval, setApproval] = useState<ApprovalFilter>("");
  const { data, isLoading } = useListAllStoresForAdminQuery();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState title={t("noStoresYet")} description={t("newApplicationsShowUpHere")} />;
  }

  const query = search.trim().toLowerCase();
  const filtered = data
    .filter((s) => (query ? s.name.toLowerCase().includes(query) : true))
    .filter((s) => {
      if (approval === "approved") return s.isApproved;
      if (approval === "pending") return !s.isApproved;
      return true;
    })
    // Pending-approval stores need attention first.
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
        <EmptyState title={t("noStoresFound")} description={t("tryDifferentFilters")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((store) => (
            <StoreCard key={store._id} store={store} />
          ))}
        </div>
      )}
    </div>
  );
}
