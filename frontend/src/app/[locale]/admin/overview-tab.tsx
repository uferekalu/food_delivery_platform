"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetAdminAnalyticsQuery } from "@/lib/redux/services/admin-api";
import type { OrderStatus } from "@/lib/redux/restaurant-types";
import type { UserRole } from "@/lib/constants/roles";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{label}</span>
        <span className="text-2xl font-bold text-text">{value}</span>
      </CardContent>
    </Card>
  );
}

export function OverviewTab() {
  const t = useTranslations("AdminOverviewTab");
  const tStatus = useTranslations("OrderStatus");
  const tRole = useTranslations("UserRole");
  const { data, isLoading } = useGetAdminAnalyticsQuery();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const revenueEntries = Object.entries(data.orders.revenueByCurrency);
  const statusEntries = Object.entries(data.orders.byStatus).filter(([, count]) => count > 0) as [
    OrderStatus,
    number,
  ][];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label={t("totalOrders")} value={data.orders.total} />
        <StatCard label={t("restaurantsApproved")} value={data.restaurants.approved} />
        <StatCard label={t("restaurantsPending")} value={data.restaurants.pending} />
        <StatCard label={t("storesApproved")} value={data.stores.approved} />
        <StatCard label={t("storesPending")} value={data.stores.pending} />
        <StatCard label={t("ridersPendingVerification")} value={data.riders.pending} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("revenueByCurrency")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {revenueEntries.length === 0 ? (
              <p className="text-sm text-text-muted">{t("noCollectedPaymentsYet")}</p>
            ) : (
              revenueEntries.map(([currency, total]) => (
                <div key={currency} className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">{currency}</span>
                  <span className="font-medium text-text">{total.toFixed(2)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("ordersByStatus")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {statusEntries.map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className="text-text-muted">{tStatus(status)}</span>
                <span className="font-medium text-text">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("usersByRole")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Object.entries(data.users).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between text-sm">
                <span className="text-text-muted">{tRole(role as UserRole)}</span>
                <span className="font-medium text-text">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("riders")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">{t("verified")}</span>
              <span className="font-medium text-text">{data.riders.verified}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">{t("pending")}</span>
              <span className="font-medium text-text">{data.riders.pending}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
