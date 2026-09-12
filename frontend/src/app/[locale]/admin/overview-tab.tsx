"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { DetailRow } from "@/components/ui/detail-disclosure";
import { FeeScheduleInfo } from "@/components/fee-schedule-info";
import {
  OrderTransactionRow,
  OrderTransactionCard,
  PAYMENT_STATUS_BADGE_VARIANT,
} from "@/components/order-transaction-views";
import { useGetAdminAnalyticsQuery } from "@/lib/redux/services/admin-api";
import { useGetOrderTransactionsQuery } from "@/lib/redux/services/admin-api";
import { useGetAdCampaignTransactionsQuery } from "@/lib/redux/services/ad-campaigns-api";
import { formatMoney } from "@/lib/currency";
import type { OrderStatus, AdCampaignStatus } from "@/lib/redux/restaurant-types";
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

const AD_CAMPAIGN_STATUS_BADGE_VARIANT: Record<AdCampaignStatus, BadgeProps["variant"]> = {
  pending_payment: "warning",
  scheduled: "info",
  active: "success",
  ended: "neutral",
  cancelled: "danger",
};

function TotalsByCurrencyFooter({
  totalsByCurrency,
  label,
  locale,
}: {
  totalsByCurrency: Record<string, number>;
  label: string;
  locale: string;
}) {
  const entries = Object.entries(totalsByCurrency);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border pt-3 text-sm">
      <span className="font-medium text-text-muted">{label}</span>
      {entries.map(([currency, total]) => (
        <span key={currency} className="font-semibold text-text">
          {formatMoney(total, currency, locale)}
        </span>
      ))}
    </div>
  );
}

// Every order across every vendor (restaurant/grocery/pharmacy), paginated and filterable, with a
// full categorical fee breakdown per order (docs/ROADMAP.md FDP-129) — the admin-wide audit ledger
// originally requested in FDP-128, expanded so subtotal/delivery fee/service fee/tax/discount/
// platform fee/vendor payout are all explicit per transaction, not just a bare total. The list
// itself shows every status (a CANCELLED order is still an auditable event); the totals footer
// only counts money actually collected (succeeded/refunded), matching getAnalyticsSummary's
// established convention. Desktop renders a wide table; below `sm`, each row becomes its own
// collapsible card instead, so nothing requires horizontal scrolling on a phone.
function OrderTransactionsSection() {
  const t = useTranslations("AdminOverviewTab");
  const tStatus = useTranslations("OrderStatus");
  const tPayment = useTranslations("OrderPaymentStatus");
  const locale = useLocale();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vendorType, setVendorType] = useState<"" | "restaurant" | "store">("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useGetOrderTransactionsQuery({
    from: from || undefined,
    to: to || undefined,
    vendorType: vendorType || undefined,
    page,
    limit: 20,
  });

  const vendorTypeOptions = [
    { value: "", label: t("allVendorTypes") },
    { value: "restaurant", label: t("restaurants") },
    { value: "store", label: t("storesVendorType") },
  ];

  function resetPageAnd<T>(setter: (v: T) => void) {
    return (v: T) => {
      setPage(1);
      setter(v);
    };
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("orderTransactions")}</CardTitle>
        <CardDescription>{t("orderTransactionsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FeeScheduleInfo />

        <div className="flex flex-wrap items-end gap-4">
          <FormField label={t("from")}>
            <Input
              type="date"
              value={from}
              onChange={(e) => resetPageAnd<string>(setFrom)(e.target.value)}
              max={to || undefined}
            />
          </FormField>
          <FormField label={t("to")}>
            <Input
              type="date"
              value={to}
              onChange={(e) => resetPageAnd<string>(setTo)(e.target.value)}
              min={from || undefined}
            />
          </FormField>
          <FormField label={t("vendorType")}>
            <Select
              options={vendorTypeOptions}
              value={vendorType}
              onChange={(v) => resetPageAnd<"" | "restaurant" | "store">(setVendorType)(v as "" | "restaurant" | "store")}
              className="w-44"
            />
          </FormField>
          {(from || to || vendorType) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom("");
                setTo("");
                setVendorType("");
                setPage(1);
              }}
            >
              {t("clearFilters")}
            </Button>
          )}
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title={t("noTransactionsFound")} description={t("tryDifferentFilters")} />
        ) : (
          <>
            {/* Desktop: a wide table (established pattern for data-heavy admin views). */}
            <div className={`hidden overflow-x-auto sm:block ${isFetching ? "opacity-60 transition-opacity" : ""}`}>
              <table className="w-full min-w-[1600px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="py-2 pr-4 font-medium">{t("date")}</th>
                    <th className="py-2 pr-4 font-medium">{t("vendor")}</th>
                    <th className="py-2 pr-4 font-medium">{t("orderNumber")}</th>
                    <th className="py-2 pr-4 font-medium">{t("items")}</th>
                    <th className="py-2 pr-4 font-medium">{t("subtotal")}</th>
                    <th className="py-2 pr-4 font-medium">{t("deliveryFee")}</th>
                    <th className="py-2 pr-4 font-medium">{t("serviceFee")}</th>
                    <th className="py-2 pr-4 font-medium">{t("tax")}</th>
                    <th className="py-2 pr-4 font-medium">{t("discount")}</th>
                    <th className="py-2 pr-4 font-medium">{t("platformFee")}</th>
                    <th className="py-2 pr-4 font-medium">{t("payoutToVendor")}</th>
                    <th className="py-2 pr-4 font-medium">{t("total")}</th>
                    <th className="py-2 pr-4 font-medium">{t("status")}</th>
                    <th className="py-2 font-medium">{t("payment")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((order) => (
                    <tr key={order._id} className="border-b border-border last:border-0 align-top">
                      <OrderTransactionRow
                        order={order}
                        locale={locale}
                        showVendor
                        t={t}
                        tStatus={tStatus}
                        tPayment={tPayment}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: one collapsible card per transaction — no horizontal scrolling required. */}
            <div className={`flex flex-col gap-3 sm:hidden ${isFetching ? "opacity-60 transition-opacity" : ""}`}>
              {data.items.map((order) => (
                <OrderTransactionCard
                  key={order._id}
                  order={order}
                  locale={locale}
                  showVendor
                  t={t}
                  tStatus={tStatus}
                  tPayment={tPayment}
                />
              ))}
            </div>

            <TotalsByCurrencyFooter
              totalsByCurrency={data.totalsByCurrency}
              label={t("totalCollected")}
              locale={locale}
            />

            {data.totalPages > 1 && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// The other half of the audit ledger: every ad-campaign charge, across every vendor, separate
// from the order ledger above since ad revenue and order revenue are distinct revenue streams
// (per the user's explicit request to document ad sales separately). Only 6 fields, so mobile
// gets a plain stacked info card rather than a full accordion — nothing here needs hiding behind
// a toggle, just laid out vertically instead of in a horizontally-scrolling table row.
function AdvertisingRevenueSection() {
  const t = useTranslations("AdminOverviewTab");
  const tCampaignStatus = useTranslations("AdminAdCampaignsTab");
  const tPayment = useTranslations("OrderPaymentStatus");
  const locale = useLocale();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useGetAdCampaignTransactionsQuery({
    from: from || undefined,
    to: to || undefined,
    page,
    limit: 20,
  });

  function resetPageAnd<T>(setter: (v: T) => void) {
    return (v: T) => {
      setPage(1);
      setter(v);
    };
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("advertisingRevenue")}</CardTitle>
        <CardDescription>{t("advertisingRevenueDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <FormField label={t("from")}>
            <Input
              type="date"
              value={from}
              onChange={(e) => resetPageAnd<string>(setFrom)(e.target.value)}
              max={to || undefined}
            />
          </FormField>
          <FormField label={t("to")}>
            <Input
              type="date"
              value={to}
              onChange={(e) => resetPageAnd<string>(setTo)(e.target.value)}
              min={from || undefined}
            />
          </FormField>
          {(from || to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom("");
                setTo("");
                setPage(1);
              }}
            >
              {t("clearFilters")}
            </Button>
          )}
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title={t("noCampaignTransactionsFound")} description={t("tryDifferentFilters")} />
        ) : (
          <>
            <div className={`hidden overflow-x-auto sm:block ${isFetching ? "opacity-60 transition-opacity" : ""}`}>
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="py-2 pr-4 font-medium">{t("date")}</th>
                    <th className="py-2 pr-4 font-medium">{t("vendor")}</th>
                    <th className="py-2 pr-4 font-medium">{t("campaignPeriod")}</th>
                    <th className="py-2 pr-4 font-medium">{t("amount")}</th>
                    <th className="py-2 pr-4 font-medium">{t("status")}</th>
                    <th className="py-2 font-medium">{t("payment")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((campaign) => (
                    <tr key={campaign._id} className="border-b border-border last:border-0 align-top">
                      <td className="py-2 pr-4 whitespace-nowrap text-text">
                        {new Date(campaign.createdAt).toLocaleDateString(locale)}
                      </td>
                      <td className="py-2 pr-4 text-text">
                        {campaign.vendor.name}
                        <Badge variant="neutral" className="ml-2 align-middle">
                          {campaign.vendor.type === "restaurant" ? t("restaurants") : t("storesVendorType")}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-text-muted">
                        {new Date(campaign.startDate).toLocaleDateString(locale)} –{" "}
                        {new Date(campaign.endDate).toLocaleDateString(locale)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap font-medium text-text">
                        {formatMoney(campaign.totalPrice, campaign.currency, locale)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <Badge variant={AD_CAMPAIGN_STATUS_BADGE_VARIANT[campaign.status]}>
                          {tCampaignStatus(`status_${campaign.status}`)}
                        </Badge>
                      </td>
                      <td className="py-2 whitespace-nowrap">
                        <Badge variant={PAYMENT_STATUS_BADGE_VARIANT[campaign.paymentStatus]}>
                          {tPayment(campaign.paymentStatus)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={`flex flex-col gap-3 sm:hidden ${isFetching ? "opacity-60 transition-opacity" : ""}`}>
              {data.items.map((campaign) => (
                <Card key={campaign._id} className="border-border">
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-text">
                        {formatMoney(campaign.totalPrice, campaign.currency, locale)}
                      </span>
                      <Badge variant={AD_CAMPAIGN_STATUS_BADGE_VARIANT[campaign.status]}>
                        {tCampaignStatus(`status_${campaign.status}`)}
                      </Badge>
                    </div>
                    <span className="text-xs text-text-muted">
                      {new Date(campaign.createdAt).toLocaleDateString(locale)} · {campaign.vendor.name}
                    </span>
                    <div className="flex flex-col divide-y divide-border pt-1">
                      <DetailRow
                        label={t("vendor")}
                        value={`${campaign.vendor.name} (${campaign.vendor.type === "restaurant" ? t("restaurants") : t("storesVendorType")})`}
                      />
                      <DetailRow
                        label={t("campaignPeriod")}
                        value={`${new Date(campaign.startDate).toLocaleDateString(locale)} – ${new Date(campaign.endDate).toLocaleDateString(locale)}`}
                      />
                      <DetailRow
                        label={t("payment")}
                        value={
                          <Badge variant={PAYMENT_STATUS_BADGE_VARIANT[campaign.paymentStatus]}>
                            {tPayment(campaign.paymentStatus)}
                          </Badge>
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <TotalsByCurrencyFooter
              totalsByCurrency={data.totalsByCurrency}
              label={t("totalCollected")}
              locale={locale}
            />

            {data.totalPages > 1 && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function OverviewTab() {
  const t = useTranslations("AdminOverviewTab");
  const tStatus = useTranslations("OrderStatus");
  const tRole = useTranslations("UserRole");
  const locale = useLocale();
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
                  <span className="font-medium text-text">{formatMoney(total, currency, locale)}</span>
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

      <OrderTransactionsSection />
      <AdvertisingRevenueSection />
    </div>
  );
}
