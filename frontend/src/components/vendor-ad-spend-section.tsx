"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { useListMyAdCampaignsQuery } from "@/lib/redux/services/ad-campaigns-api";
import { formatMoney } from "@/lib/currency";
import type { AdCampaignStatus, AdCampaignPaymentStatus } from "@/lib/redux/restaurant-types";

const STATUS_BADGE_VARIANT: Record<AdCampaignStatus, BadgeProps["variant"]> = {
  pending_payment: "warning",
  scheduled: "info",
  active: "success",
  ended: "neutral",
  cancelled: "danger",
};

const PAYMENT_STATUS_BADGE_VARIANT: Record<AdCampaignPaymentStatus, BadgeProps["variant"]> = {
  pending: "warning",
  succeeded: "success",
  failed: "danger",
};

// A vendor's own ad-campaign spend, shown in their sales report (docs/ROADMAP.md FDP-128) so
// advertising cost is documented alongside order revenue for that same vendor — the user's
// explicit follow-up request. Reuses useListMyAdCampaignsQuery() (already scoped server-side to
// campaigns the calling vendor owns, docs/ROADMAP.md FDP-124) rather than a new endpoint, then
// filters client-side to this specific restaurant/store and the page's existing date range.
export function VendorAdSpendSection({
  vendorType,
  vendorId,
  from,
  to,
}: {
  vendorType: "restaurant" | "store";
  vendorId: string;
  from: string;
  to: string;
}) {
  const t = useTranslations("SalesReportPage");
  const tStatus = useTranslations("VendorAdCampaignsPage");
  const locale = useLocale();
  const { data, isLoading } = useListMyAdCampaignsQuery();

  const campaigns = useMemo(() => {
    if (!data) return [];
    const fromTime = from ? new Date(from).getTime() : null;
    // Inclusive of the whole "to" day, matching the date-range filter's own semantics elsewhere
    // on this page (a plain Date(to) would cut off at midnight, excluding same-day campaigns).
    const toTime = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    return data
      .filter((c) => (vendorType === "restaurant" ? c.restaurantId === vendorId : c.storeId === vendorId))
      .filter((c) => {
        const createdAt = new Date(c.createdAt).getTime();
        if (fromTime !== null && createdAt < fromTime) return false;
        if (toTime !== null && createdAt > toTime) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data, vendorType, vendorId, from, to]);

  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const c of campaigns) {
      if (c.paymentStatus !== "succeeded") continue;
      totals[c.currency] = (totals[c.currency] ?? 0) + c.totalPrice;
    }
    return totals;
  }, [campaigns]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("advertising")}</CardTitle>
        <CardDescription>{t("advertisingDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : campaigns.length === 0 ? (
          <EmptyState title={t("noAdSpendInRange")} description={t("adSpendAppearsHere")} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="py-2 pr-4 font-medium">{t("campaignPeriod")}</th>
                    <th className="py-2 pr-4 font-medium">{t("amount")}</th>
                    <th className="py-2 pr-4 font-medium">{t("status")}</th>
                    <th className="py-2 font-medium">{t("payment")}</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c._id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 whitespace-nowrap text-text">
                        {new Date(c.startDate).toLocaleDateString(locale)} –{" "}
                        {new Date(c.endDate).toLocaleDateString(locale)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap font-medium text-text">
                        {formatMoney(c.totalPrice, c.currency, locale)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <Badge variant={STATUS_BADGE_VARIANT[c.status]}>{tStatus(`status_${c.status}`)}</Badge>
                      </td>
                      <td className="py-2 whitespace-nowrap">
                        <Badge variant={PAYMENT_STATUS_BADGE_VARIANT[c.paymentStatus]}>
                          {t(`adPaymentStatus_${c.paymentStatus}`)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {Object.keys(totalsByCurrency).length > 0 && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border pt-3 text-sm">
                <span className="font-medium text-text-muted">{t("totalAdSpend")}</span>
                {Object.entries(totalsByCurrency).map(([currency, total]) => (
                  <span key={currency} className="font-semibold text-text">
                    {formatMoney(total, currency, locale)}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
