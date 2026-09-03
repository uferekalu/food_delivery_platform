"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useListAllRidersQuery } from "@/lib/redux/services/riders-api";
import type { Rider } from "@/lib/redux/restaurant-types";

function RiderCard({ rider }: { rider: Rider }) {
  const t = useTranslations("AdminRidersTab");
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-medium text-text capitalize">{rider.vehicleType}</span>
          <Badge variant={rider.isVerified ? "success" : "warning"}>
            {rider.isVerified ? t("verified") : t("pending")}
          </Badge>
        </div>
        <span className="text-sm text-text-muted">{t("applied", { date: new Date(rider.createdAt).toLocaleDateString() })}</span>
        <Link
          href={`/admin/riders/${rider._id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}
        >
          {rider.isVerified ? t("viewDetails") : t("reviewApplication")}
        </Link>
      </CardContent>
    </Card>
  );
}

export function RidersTab() {
  const t = useTranslations("AdminRidersTab");
  const { data, isLoading } = useListAllRidersQuery();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState title={t("noRidersYet")} description={t("applicationsShowUpHere")} />;
  }

  // Pending-verification riders need attention first — sort them ahead of already-verified ones.
  const sorted = [...data].sort((a, b) => Number(a.isVerified) - Number(b.isVerified));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((rider) => (
        <RiderCard key={rider._id} rider={rider} />
      ))}
    </div>
  );
}
