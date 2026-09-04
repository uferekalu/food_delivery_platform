"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useListPendingStoresQuery } from "@/lib/redux/services/stores-api";
import type { Store } from "@/lib/redux/restaurant-types";

function PendingStoreCard({ store }: { store: Store }) {
  const t = useTranslations("AdminStoresTab");
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">{store.name}</span>
          <span className="text-sm text-text-muted">
            {store.type === "groceries" ? t("groceries") : t("pharmacyBeauty")}
            {store.tags.length > 0 ? ` · ${store.tags.join(", ")}` : ""} · {store.currency} ·{" "}
            {store.address.city}, {store.address.state}
          </span>
        </div>
        {/* No direct "Approve" here — an admin needs to see the store's actual catalog before
            approving it, not just this summary card, or an owner can get approved with no
            products at all. The review page has the approve action. */}
        <Link
          href={`/admin/stores/${store._id}`}
          className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}
        >
          {t("reviewAndApprove")}
        </Link>
      </CardContent>
    </Card>
  );
}

export function StoresTab() {
  const t = useTranslations("AdminStoresTab");
  const { data, isLoading } = useListPendingStoresQuery();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState title={t("noStoresAwaitingApproval")} description={t("newApplicationsShowUpHere")} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((store) => (
        <PendingStoreCard key={store._id} store={store} />
      ))}
    </div>
  );
}
