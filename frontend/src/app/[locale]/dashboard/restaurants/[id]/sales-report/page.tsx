"use client";

import { use, useState } from "react";
import { useTranslations } from "next-intl";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { useGetMyRestaurantsQuery } from "@/lib/redux/services/restaurants-api";
import { useGetSalesReportQuery } from "@/lib/redux/services/orders-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { Restaurant } from "@/lib/redux/restaurant-types";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-xl font-bold text-text">{value}</span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  );
}

/** No auth header can be attached to a plain `<a href>` download — the access token lives in
 * Redux, not a browser-readable cookie (docs/ARCHITECTURE.md §11) — so this fetches the CSV with
 * the same Authorization header RTK Query's baseQuery attaches, then saves it via a Blob. First
 * download of this kind in the app; a 401 here (an access token that expired in the ~15 minutes
 * since page load) just surfaces as a toast asking to retry, rather than replicating RTK Query's
 * full reauth-retry machinery for a rare, user-initiated click. */
function DownloadCsvButton({ restaurantId, from, to }: { restaurantId: string; from: string; to: string }) {
  const t = useTranslations("SalesReportPage");
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const res = await fetch(`/api/orders/restaurant/${restaurantId}/sales-report/export${qs ? `?${qs}` : ""}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Couldn't generate the CSV export");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sales-report-${restaurantId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: t("couldNotDownloadCsv"), description: getErrorMessage(err), variant: "danger" });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" isLoading={downloading} onClick={() => void handleDownload()}>
      {t("downloadCsv")}
    </Button>
  );
}

function SalesReportView({ restaurant }: { restaurant: Restaurant }) {
  const t = useTranslations("SalesReportPage");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading, isFetching, isError } = useGetSalesReportQuery({
    restaurantId: restaurant._id,
    from: from || undefined,
    to: to || undefined,
  });

  const currency = data?.currency ?? restaurant.currency;
  const money = (value: number) => `${currency} ${value.toFixed(2)}`;

  return (
    <Container className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text">{t("salesReport")}</h1>
        <p className="text-text-muted">{restaurant.name}</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <FormField label={t("from")}>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to || undefined} />
          </FormField>
          <FormField label={t("to")}>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined} />
          </FormField>
          {(from || to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              {t("clearRange")}
            </Button>
          )}
          <div className="ml-auto">
            <DownloadCsvButton restaurantId={restaurant._id} from={from} to={to} />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError || !data ? (
        <Alert variant="danger">{t("couldNotLoadSalesReport")}</Alert>
      ) : data.totals.orders === 0 ? (
        <EmptyState title={t("noDeliveredOrdersInRange")} description={t("salesFiguresAppearHere")} />
      ) : (
        <>
          {data.itemsMissingCostPrice.length > 0 && (
            <Alert variant="warning" title={t("someItemsMissingCostPrice")}>
              {t("profitFiguresExclude", { items: data.itemsMissingCostPrice.join(", ") })}
            </Alert>
          )}

          <Card className={isFetching ? "opacity-60 transition-opacity" : undefined}>
            <CardContent className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
              <Stat label={t("revenue")} value={money(data.totals.revenue)} />
              <Stat label={t("costOfGoodsSold")} value={money(data.totals.cogs)} />
              <Stat label={t("grossProfit")} value={money(data.totals.grossProfit)} />
              <Stat
                label={t("grossMargin")}
                value={data.totals.grossMarginPct == null ? "—" : `${data.totals.grossMarginPct.toFixed(1)}%`}
              />
              <Stat label={t("orders")} value={String(data.totals.orders)} />
              <Stat label={t("avgOrderValue")} value={money(data.totals.avgOrderValue)} />
              <Stat label={t("platformFee")} value={money(data.totals.platformFeeTotal)} />
              <Stat label={t("netPayout")} value={money(data.totals.netEarned)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("salesByItem")}</CardTitle>
              <CardDescription>{t("sortedByRevenue")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="py-2 pr-4 font-medium">{t("item")}</th>
                    <th className="py-2 pr-4 font-medium">{t("qtySold")}</th>
                    <th className="py-2 pr-4 font-medium">{t("revenue")}</th>
                    <th className="py-2 pr-4 font-medium">{t("cogs")}</th>
                    <th className="py-2 pr-4 font-medium">{t("profit")}</th>
                    <th className="py-2 font-medium">{t("margin")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byItem.map((item) => (
                    <tr key={item.menuItemId} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 text-text">
                        {item.name}
                        {item.hasIncompleteCostData && (
                          <span className="ml-1 text-xs text-warning" title={t("incompleteCostDataTitle")}>
                            *
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-text">{item.qtySold}</td>
                      <td className="py-2 pr-4 text-text">{money(item.revenue)}</td>
                      <td className="py-2 pr-4 text-text">{money(item.cogs)}</td>
                      <td className="py-2 pr-4 text-text">{money(item.profit)}</td>
                      <td className="py-2 text-text">{item.marginPct == null ? "—" : `${item.marginPct.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("salesByDay")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="py-2 pr-4 font-medium">{t("date")}</th>
                    <th className="py-2 pr-4 font-medium">{t("orders")}</th>
                    <th className="py-2 pr-4 font-medium">{t("revenue")}</th>
                    <th className="py-2 pr-4 font-medium">{t("cogs")}</th>
                    <th className="py-2 font-medium">{t("profit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byDay.map((day) => (
                    <tr key={day.date} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 text-text">{day.date}</td>
                      <td className="py-2 pr-4 text-text">{day.orders}</td>
                      <td className="py-2 pr-4 text-text">{money(day.revenue)}</td>
                      <td className="py-2 pr-4 text-text">{money(day.cogs)}</td>
                      <td className="py-2 text-text">{money(day.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </Container>
  );
}

function SalesReportPage({ id }: { id: string }) {
  const t = useTranslations("SalesReportPage");
  const { data: restaurants, isLoading } = useGetMyRestaurantsQuery();
  const restaurant = restaurants?.find((r) => r._id === id);

  if (isLoading) {
    return (
      <Container className="py-10">
        <Skeleton className="h-64 w-full" />
      </Container>
    );
  }

  if (!restaurant) {
    return (
      <Container className="py-10">
        <EmptyState title={t("restaurantNotFound")} description={t("mayNotExistOrNoAccess")} />
      </Container>
    );
  }

  return <SalesReportView restaurant={restaurant} />;
}

export default function DashboardRestaurantSalesReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <SalesReportPage id={id} />
    </RequireRole>
  );
}
