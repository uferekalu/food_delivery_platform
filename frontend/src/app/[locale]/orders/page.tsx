"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { useGetMyOrdersQuery } from "@/lib/redux/services/orders-api";
import { getErrorMessage } from "@/lib/redux/error";
import { formatMoney } from "@/lib/currency";
import type { Order, OrderStatus } from "@/lib/redux/restaurant-types";

const STATUS_BADGE_VARIANT: Record<OrderStatus, BadgeProps["variant"]> = {
  PENDING_PAYMENT: "warning",
  PLACED: "info",
  ACCEPTED_BY_RESTAURANT: "info",
  PREPARING: "info",
  READY_FOR_PICKUP: "info",
  ASSIGNED_TO_RIDER: "info",
  PICKED_UP: "info",
  OUT_FOR_DELIVERY: "info",
  DELIVERED: "success",
  CANCELLED: "danger",
  REFUNDED: "neutral",
};

function OrderRow({ order }: { order: Order }) {
  const t = useTranslations("OrdersPage");
  const tStatus = useTranslations("OrderStatus");
  const locale = useLocale();
  const itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <Link href={`/orders/${order._id}`}>
      <Card className="transition-colors duration-150 hover:border-border-strong">
        <CardContent className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text">{order.orderNumber}</span>
            <span className="text-xs text-text-muted">
              {new Date(order.createdAt).toLocaleDateString()} · {t("itemCount", { count: itemCount })}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-text">
              {formatMoney(order.total, order.currency, locale)}
            </span>
            <Badge variant={STATUS_BADGE_VARIANT[order.status]}>{tStatus(order.status)}</Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function OrderHistory() {
  const t = useTranslations("OrdersPage");
  const { data: orders, isLoading, error } = useGetMyOrdersQuery();

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" label={t("loadingYourOrders")} />
      </div>
    );
  }

  if (error) {
    return <Alert variant="danger">{getErrorMessage(error, t("couldNotLoadOrders"))}</Alert>;
  }

  if (!orders || orders.length === 0) {
    return (
      <EmptyState
        title={t("noOrdersYet")}
        description={t("pastOrdersShowUpHere")}
        action={
          <Link href="/restaurants" className={buttonVariants({ variant: "primary" })}>
            {t("browseRestaurants")}
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => (
        <OrderRow key={order._id} order={order} />
      ))}
    </div>
  );
}

export default function OrdersPage() {
  const t = useTranslations("OrdersPage");
  const { status } = useAppSelector((state) => state.auth);

  if (status === "idle") {
    return (
      <Container className="flex justify-center py-24">
        <Spinner size="lg" label={t("checkingSession")} />
      </Container>
    );
  }

  if (status !== "authenticated") {
    return (
      <Container className="py-10">
        <EmptyState
          title={t("logInToViewOrders")}
          description={t("needToBeLoggedInOrders")}
          action={
            <Link href="/login" className={buttonVariants({ variant: "primary" })}>
              {t("logIn")}
            </Link>
          }
        />
      </Container>
    );
  }

  return (
    <Container className="max-w-2xl py-10">
      <h1 className="mb-6 text-2xl font-bold text-text">{t("yourOrders")}</h1>
      <OrderHistory />
    </Container>
  );
}
