"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetAdminAnalyticsQuery } from "@/lib/redux/services/admin-api";
import type { OrderStatus } from "@/lib/redux/restaurant-types";

function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

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
  const { data, isLoading } = useGetAdminAnalyticsQuery();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total orders" value={data.orders.total} />
        <StatCard label="Restaurants approved" value={data.restaurants.approved} />
        <StatCard label="Restaurants pending" value={data.restaurants.pending} />
        <StatCard label="Riders pending verification" value={data.riders.pending} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by currency</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {revenueEntries.length === 0 ? (
              <p className="text-sm text-text-muted">No collected payments yet.</p>
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
            <CardTitle>Orders by status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {statusEntries.map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className="text-text-muted">{formatStatus(status)}</span>
                <span className="font-medium text-text">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Users by role</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Object.entries(data.users).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between text-sm">
                <span className="text-text-muted">{formatStatus(role)}</span>
                <span className="font-medium text-text">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Riders</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Verified</span>
              <span className="font-medium text-text">{data.riders.verified}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Pending</span>
              <span className="font-medium text-text">{data.riders.pending}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
