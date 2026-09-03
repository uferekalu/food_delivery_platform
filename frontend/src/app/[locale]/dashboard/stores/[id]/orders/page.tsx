"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useGetMyStoresQuery } from "@/lib/redux/services/stores-api";
import { useGetStoreOrdersQuery, useUpdateOrderStatusMutation } from "@/lib/redux/services/orders-api";
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

function OrderActions({ order }: { order: Order }) {
  const t = useTranslations("DashboardOrdersPage");
  const { toast } = useToast();
  const [updateStatus, { isLoading }] = useUpdateOrderStatusMutation();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  function transition(status: OrderStatus) {
    void updateStatus({ orderId: order._id, status })
      .unwrap()
      .then(() => setConfirmingCancel(false))
      .catch((err: unknown) => {
        setConfirmingCancel(false);
        toast({ title: t("couldNotUpdateOrder"), description: getErrorMessage(err), variant: "danger" });
      });
  }

  const cancelDialog = (
    <ConfirmDialog
      open={confirmingCancel}
      onClose={() => setConfirmingCancel(false)}
      onConfirm={() => transition("CANCELLED")}
      title={t("cancelOrderTitle", { orderNumber: order.orderNumber })}
      description={t("cancelOrderDescription")}
      confirmLabel={t("cancelOrder")}
      isLoading={isLoading}
    />
  );

  if (order.status === "PLACED") {
    return (
      <div className="flex gap-2">
        <Button size="sm" isLoading={isLoading} onClick={() => transition("ACCEPTED_BY_RESTAURANT")}>
          {t("accept")}
        </Button>
        <Button size="sm" variant="destructive" isLoading={isLoading} onClick={() => setConfirmingCancel(true)}>
          {t("reject")}
        </Button>
        {cancelDialog}
      </div>
    );
  }

  if (order.status === "ACCEPTED_BY_RESTAURANT") {
    return (
      <div className="flex gap-2">
        <Button size="sm" isLoading={isLoading} onClick={() => transition("PREPARING")}>
          {t("startPreparing")}
        </Button>
        <Button size="sm" variant="ghost" isLoading={isLoading} onClick={() => setConfirmingCancel(true)}>
          {t("cancel")}
        </Button>
        {cancelDialog}
      </div>
    );
  }

  if (order.status === "PREPARING") {
    return (
      <div className="flex gap-2">
        <Button size="sm" isLoading={isLoading} onClick={() => transition("READY_FOR_PICKUP")}>
          {t("markReady")}
        </Button>
        <Button size="sm" variant="ghost" isLoading={isLoading} onClick={() => setConfirmingCancel(true)}>
          {t("cancel")}
        </Button>
        {cancelDialog}
      </div>
    );
  }

  return <span className="text-sm text-text-muted">{t("waitingForARider")}</span>;
}

function OrderQueueCard({ order }: { order: Order }) {
  const tStatus = useTranslations("OrderStatus");
  const itemsSummary = order.items.map((item) => `${item.qty}× ${item.name}`).join(", ");

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text">{order.orderNumber}</span>
            <span className="text-xs text-text-muted">{new Date(order.createdAt).toLocaleTimeString()}</span>
          </div>
          <Badge variant={STATUS_BADGE_VARIANT[order.status]}>{tStatus(order.status)}</Badge>
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

function OrderQueue({ storeId, storeName }: { storeId: string; storeName: string }) {
  const t = useTranslations("DashboardOrdersPage");
  const tStatus = useTranslations("OrderStatus");
  const { data: orders, isLoading, refetch } = useGetStoreOrdersQuery(storeId);
  const socket = useSocket();
  const { toast } = useToast();

  useEffect(() => {
    if (!socket) return;
    socket.emit("store:subscribe", { storeId });

    const handleOrderUpdated = (order: Order) => {
      if (order.storeId !== storeId) return;
      toast({ title: order.orderNumber, description: tStatus(order.status), variant: "neutral" });
      void refetch();
    };
    socket.on("store:orderUpdated", handleOrderUpdated);
    return () => {
      socket.off("store:orderUpdated", handleOrderUpdated);
    };
  }, [socket, storeId, refetch, toast, tStatus]);

  return (
    <Container className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text">{t("orderQueue")}</h1>
        <p className="text-text-muted">{storeName}</p>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : !orders || orders.length === 0 ? (
        <EmptyState title={t("noActiveOrders")} description={t("newOrdersAppearHere")} />
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
  const t = useTranslations("DashboardOrdersPage");
  const { data: stores, isLoading } = useGetMyStoresQuery();
  const store = stores?.find((s) => s._id === id);

  if (isLoading) {
    return (
      <Container className="py-10">
        <Skeleton className="h-64 w-full" />
      </Container>
    );
  }

  if (!store) {
    return (
      <Container className="py-10">
        <EmptyState title={t("storeNotFound")} description={t("mayNotExistOrNoAccess")} />
      </Container>
    );
  }

  return <OrderQueue storeId={id} storeName={store.name} />;
}

export default function DashboardStoreOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <OrderQueuePage id={id} />
    </RequireRole>
  );
}
