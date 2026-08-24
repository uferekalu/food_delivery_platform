"use client";

import { use, useEffect } from "react";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useGetMyRestaurantsQuery } from "@/lib/redux/services/restaurants-api";
import { useGetRestaurantOrdersQuery, useUpdateOrderStatusMutation } from "@/lib/redux/services/orders-api";
import { getErrorMessage } from "@/lib/redux/error";
import { useSocket } from "@/hooks/use-socket";
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

function formatStatus(status: OrderStatus): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function OrderActions({ order }: { order: Order }) {
  const { toast } = useToast();
  const [updateStatus, { isLoading }] = useUpdateOrderStatusMutation();

  function transition(status: OrderStatus) {
    void updateStatus({ orderId: order._id, status })
      .unwrap()
      .catch((err: unknown) =>
        toast({ title: "Couldn't update the order", description: getErrorMessage(err), variant: "danger" }),
      );
  }

  if (order.status === "PLACED") {
    return (
      <div className="flex gap-2">
        <Button size="sm" isLoading={isLoading} onClick={() => transition("ACCEPTED_BY_RESTAURANT")}>
          Accept
        </Button>
        <Button size="sm" variant="destructive" isLoading={isLoading} onClick={() => transition("CANCELLED")}>
          Reject
        </Button>
      </div>
    );
  }

  if (order.status === "ACCEPTED_BY_RESTAURANT") {
    return (
      <div className="flex gap-2">
        <Button size="sm" isLoading={isLoading} onClick={() => transition("PREPARING")}>
          Start preparing
        </Button>
        <Button size="sm" variant="ghost" isLoading={isLoading} onClick={() => transition("CANCELLED")}>
          Cancel
        </Button>
      </div>
    );
  }

  if (order.status === "PREPARING") {
    return (
      <div className="flex gap-2">
        <Button size="sm" isLoading={isLoading} onClick={() => transition("READY_FOR_PICKUP")}>
          Mark ready
        </Button>
        <Button size="sm" variant="ghost" isLoading={isLoading} onClick={() => transition("CANCELLED")}>
          Cancel
        </Button>
      </div>
    );
  }

  // READY_FOR_PICKUP — waiting on rider assignment (docs/ROADMAP.md FDP-16's rider dashboard);
  // nothing left for the restaurant to do here.
  return <span className="text-sm text-text-muted">Waiting for a rider</span>;
}

function OrderQueueCard({ order }: { order: Order }) {
  const itemsSummary = order.items.map((item) => `${item.qty}× ${item.name}`).join(", ");

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text">{order.orderNumber}</span>
            <span className="text-xs text-text-muted">{new Date(order.createdAt).toLocaleTimeString()}</span>
          </div>
          <Badge variant={STATUS_BADGE_VARIANT[order.status]}>{formatStatus(order.status)}</Badge>
        </div>
        <p className="text-sm text-text">{itemsSummary}</p>
        <p className="text-sm font-medium text-text">
          {order.currency} {order.total.toFixed(2)}
        </p>
        <OrderActions order={order} />
      </CardContent>
    </Card>
  );
}

function OrderQueue({ restaurantId, restaurantName }: { restaurantId: string; restaurantName: string }) {
  const { data: orders, isLoading, refetch } = useGetRestaurantOrdersQuery(restaurantId);
  const socket = useSocket();
  const { toast } = useToast();

  useEffect(() => {
    if (!socket) return;
    socket.emit("restaurant:subscribe", { restaurantId });

    const handleOrderUpdated = (order: Order) => {
      if (order.restaurantId !== restaurantId) return;
      toast({ title: `${order.orderNumber}`, description: formatStatus(order.status), variant: "neutral" });
      void refetch();
    };
    socket.on("restaurant:orderUpdated", handleOrderUpdated);
    return () => {
      socket.off("restaurant:orderUpdated", handleOrderUpdated);
    };
  }, [socket, restaurantId, refetch, toast]);

  return (
    <Container className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text">Order queue</h1>
        <p className="text-text-muted">{restaurantName}</p>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : !orders || orders.length === 0 ? (
        <EmptyState title="No active orders" description="New orders will appear here as soon as they come in." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <OrderQueueCard key={order._id} order={order} />
          ))}
        </div>
      )}
    </Container>
  );
}

function OrderQueuePage({ id }: { id: string }) {
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
        <EmptyState title="Restaurant not found" description="It may not exist, or you don't have access to it." />
      </Container>
    );
  }

  return <OrderQueue restaurantId={id} restaurantName={restaurant.name} />;
}

export default function DashboardRestaurantOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <OrderQueuePage id={id} />
    </RequireRole>
  );
}
