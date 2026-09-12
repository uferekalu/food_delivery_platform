"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { FeeScheduleInfo } from "@/components/fee-schedule-info";
import { OrderTransactionRow, OrderTransactionCard } from "@/components/order-transaction-views";
import {
  useGetSalesReportTransactionsQuery,
  useGetStoreSalesReportTransactionsQuery,
} from "@/lib/redux/services/orders-api";
import { formatMoney } from "@/lib/currency";

// A vendor's own per-order fee breakdown on their sales report page (docs/ROADMAP.md FDP-129) —
// direct user feedback that a vendor shouldn't have to "struggle to make sense of their
// transactions": the same categorical Subtotal/Delivery fee/Service fee/Tax/Discount/Platform
// fee/Payout detail as the admin ledger, scoped to this one vendor, over the exact same date
// range already driving the aggregated stats/breakdowns above it on the page. `showVendor` is
// always false here — a vendor's own report never needs a "which vendor" column.
export function VendorOrderTransactionsSection({
  sellerType,
  sellerId,
  from,
  to,
}: {
  sellerType: "restaurant" | "store";
  sellerId: string;
  from: string;
  to: string;
}) {
  const t = useTranslations("SalesReportPage");
  const tStatus = useTranslations("OrderStatus");
  const tPayment = useTranslations("OrderPaymentStatus");
  const locale = useLocale();
  const [page, setPage] = useState(1);

  const restaurantQuery = useGetSalesReportTransactionsQuery(
    { restaurantId: sellerId, from: from || undefined, to: to || undefined, page, limit: 20 },
    { skip: sellerType !== "restaurant" },
  );
  const storeQuery = useGetStoreSalesReportTransactionsQuery(
    { storeId: sellerId, from: from || undefined, to: to || undefined, page, limit: 20 },
    { skip: sellerType !== "store" },
  );
  const { data, isLoading, isFetching } = sellerType === "restaurant" ? restaurantQuery : storeQuery;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("orderTransactions")}</CardTitle>
        <CardDescription>{t("orderTransactionsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FeeScheduleInfo />

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title={t("noDeliveredOrdersInRange")} description={t("salesFiguresAppearHere")} />
        ) : (
          <>
            <div className={`hidden overflow-x-auto sm:block ${isFetching ? "opacity-60 transition-opacity" : ""}`}>
              <table className="w-full min-w-[1350px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="py-2 pr-4 font-medium">{t("date")}</th>
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
                        showVendor={false}
                        t={t}
                        tStatus={tStatus}
                        tPayment={tPayment}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={`flex flex-col gap-3 sm:hidden ${isFetching ? "opacity-60 transition-opacity" : ""}`}>
              {data.items.map((order) => (
                <OrderTransactionCard
                  key={order._id}
                  order={order}
                  locale={locale}
                  showVendor={false}
                  t={t}
                  tStatus={tStatus}
                  tPayment={tPayment}
                />
              ))}
            </div>

            {data.items.length > 0 && (
              <div className="border-t border-border pt-3 text-sm">
                <span className="font-medium text-text-muted">{t("totalPayoutThisPage")}</span>{" "}
                <span className="font-semibold text-text">
                  {formatMoney(
                    data.items.reduce((sum, o) => sum + o.payoutAmount, 0),
                    data.items[0].currency,
                    locale,
                  )}
                </span>
              </div>
            )}

            {data.totalPages > 1 && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}
