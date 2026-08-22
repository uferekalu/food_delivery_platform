"use client";

import NextLink from "next/link";
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

function formatStatus(status: OrderStatus): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function OrderRow({ order }: { order: Order }) {
  const itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <NextLink href={`/orders/${order._id}`}>
      <Card className="transition-colors duration-150 hover:border-border-strong">
        <CardContent className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text">{order.orderNumber}</span>
            <span className="text-xs text-text-muted">
              {new Date(order.createdAt).toLocaleDateString()} · {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-text">
              {order.currency} {order.total.toFixed(2)}
            </span>
            <Badge variant={STATUS_BADGE_VARIANT[order.status]}>{formatStatus(order.status)}</Badge>
          </div>
        </CardContent>
      </Card>
    </NextLink>
  );
}

function OrderHistory() {
  const { data: orders, isLoading, error } = useGetMyOrdersQuery();

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" label="Loading your orders" />
      </div>
    );
  }

  if (error) {
    return <Alert variant="danger">{getErrorMessage(error, "Couldn't load your orders")}</Alert>;
  }

  if (!orders || orders.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        description="Your past orders will show up here."
        action={
          <NextLink href="/restaurants" className={buttonVariants({ variant: "primary" })}>
            Browse restaurants
          </NextLink>
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
  const { status } = useAppSelector((state) => state.auth);

  if (status === "idle") {
    return (
      <Container className="flex justify-center py-24">
        <Spinner size="lg" label="Checking your session" />
      </Container>
    );
  }

  if (status !== "authenticated") {
    return (
      <Container className="py-10">
        <EmptyState
          title="Log in to view your orders"
          description="You'll need to be logged in to see your order history."
          action={
            <NextLink href="/login" className={buttonVariants({ variant: "primary" })}>
              Log in
            </NextLink>
          }
        />
      </Container>
    );
  }

  return (
    <Container className="max-w-2xl py-10">
      <h1 className="mb-6 text-2xl font-bold text-text">Your orders</h1>
      <OrderHistory />
    </Container>
  );
}
