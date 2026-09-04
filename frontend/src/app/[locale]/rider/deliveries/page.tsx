"use client";

import { useLocale, useTranslations } from "next-intl";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useGetMyDeliveriesQuery } from "@/lib/redux/services/riders-api";
import { formatMoney } from "@/lib/currency";
import type { Order, OrderStatus } from "@/lib/redux/restaurant-types";

const STATUS_BADGE_VARIANT: Record<OrderStatus, BadgeProps["variant"]> = {
  PENDING_PAYMENT: "warning",
  PLACED: "info",
  ACCEPTED_BY_RESTAURANT: "info",
  PREPARING: "info",
  READY_FOR_PICKUP: "primary",
  ASSIGNED_TO_RIDER: "info",
  PICKED_UP: "info",
  OUT_FOR_DELIVERY: "info",
  DELIVERED: "success",
  CANCELLED: "danger",
  REFUNDED: "neutral",
};

function DeliveryRow({ order }: { order: Order }) {
  const tStatus = useTranslations("OrderStatus");
  const locale = useLocale();
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-text">{order.orderNumber}</span>
        <span className="text-xs text-text-muted">{new Date(order.createdAt).toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-text">{formatMoney(order.deliveryFee, order.currency, locale)}</span>
        <Badge variant={STATUS_BADGE_VARIANT[order.status]}>{tStatus(order.status)}</Badge>
      </div>
    </div>
  );
}

function DeliveryHistory() {
  const t = useTranslations("RiderDeliveriesPage");
  const locale = useLocale();
  const { data: deliveries, isLoading } = useGetMyDeliveriesQuery();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!deliveries || deliveries.length === 0) {
    return <EmptyState title={t("noDeliveriesYet")} description={t("acceptedOrdersShowUpHere")} />;
  }

  const delivered = deliveries.filter((o) => o.status === "DELIVERED");
  // A rider could in principle deliver for restaurants/stores in different currencies — summing
  // raw amounts across currencies into one number would silently produce a meaningless total, so
  // earnings are grouped by currency and each shown on its own line (almost always just one).
  const earningsByCurrency = delivered.reduce<Record<string, number>>((acc, o) => {
    acc[o.currency] = (acc[o.currency] ?? 0) + o.deliveryFee;
    return acc;
  }, {});
  const earningsEntries = Object.entries(earningsByCurrency);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">{t("totalEarnings")}</span>
            <span className="text-2xl font-bold text-text">
              {earningsEntries.length > 0
                ? earningsEntries.map(([currency, total]) => formatMoney(total, currency, locale)).join(" + ")
                : formatMoney(0, deliveries[0]?.currency, locale)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">{t("completedDeliveries")}</span>
            <span className="text-2xl font-bold text-text">{delivered.length}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent>
          {deliveries.map((order) => (
            <DeliveryRow key={order._id} order={order} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function RiderDeliveriesPage() {
  const t = useTranslations("RiderDeliveriesPage");
  return (
    <RequireRole roles={["rider"]}>
      <Container className="flex flex-col gap-6 py-10">
        <h1 className="text-2xl font-bold text-text">{t("deliveryHistory")}</h1>
        <DeliveryHistory />
      </Container>
    </RequireRole>
  );
}
