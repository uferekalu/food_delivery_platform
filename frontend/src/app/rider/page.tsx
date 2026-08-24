"use client";

import { useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Rating } from "@/components/ui/rating";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  useGetMyRiderProfileQuery,
  useToggleRiderOnlineMutation,
  useGetRiderQueueQuery,
  useAssignRiderOrderMutation,
  useUpdateRiderOrderStatusMutation,
  useGetMyDeliveriesQuery,
} from "@/lib/redux/services/riders-api";
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

function QueueCard({ order, verified }: { order: Order; verified: boolean }) {
  const { toast } = useToast();
  const [assignOrder, { isLoading }] = useAssignRiderOrderMutation();
  const itemsSummary = order.items.map((item) => `${item.qty}× ${item.name}`).join(", ");

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-medium text-text">{order.orderNumber}</span>
          <Badge variant={STATUS_BADGE_VARIANT[order.status]}>{formatStatus(order.status)}</Badge>
        </div>
        <p className="text-sm text-text">{itemsSummary}</p>
        <p className="text-sm text-text-muted">
          Deliver to {order.deliveryAddress.line1}, {order.deliveryAddress.city}
        </p>
        <p className="text-sm font-medium text-text">
          {order.currency} {order.deliveryFee.toFixed(2)} delivery fee
        </p>
        <Button
          size="sm"
          disabled={!verified}
          isLoading={isLoading}
          onClick={() =>
            void assignOrder(order._id)
              .unwrap()
              .then(() => toast({ title: "Order accepted", variant: "success" }))
              .catch((err: unknown) =>
                toast({ title: "Couldn't accept the order", description: getErrorMessage(err), variant: "danger" }),
              )
          }
        >
          {verified ? "Accept" : "Verification required"}
        </Button>
      </CardContent>
    </Card>
  );
}

const ACTIVE_RIDER_STATUSES: OrderStatus[] = ["ASSIGNED_TO_RIDER", "PICKED_UP", "OUT_FOR_DELIVERY"];

const NEXT_RIDER_STATUS: Partial<Record<OrderStatus, { target: OrderStatus; label: string }>> = {
  ASSIGNED_TO_RIDER: { target: "PICKED_UP", label: "Mark picked up" },
  PICKED_UP: { target: "OUT_FOR_DELIVERY", label: "Mark out for delivery" },
  OUT_FOR_DELIVERY: { target: "DELIVERED", label: "Mark delivered" },
};

function ActiveDeliveryCard({ order }: { order: Order }) {
  const { toast } = useToast();
  const [updateStatus, { isLoading }] = useUpdateRiderOrderStatusMutation();
  const itemsSummary = order.items.map((item) => `${item.qty}× ${item.name}`).join(", ");
  const next = NEXT_RIDER_STATUS[order.status];

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-medium text-text">{order.orderNumber}</span>
          <Badge variant={STATUS_BADGE_VARIANT[order.status]}>{formatStatus(order.status)}</Badge>
        </div>
        <p className="text-sm text-text">{itemsSummary}</p>
        <p className="text-sm text-text-muted">
          Deliver to {order.deliveryAddress.line1}, {order.deliveryAddress.city}
        </p>
        {next && (
          <Button
            size="sm"
            isLoading={isLoading}
            onClick={() =>
              void updateStatus({ orderId: order._id, status: next.target })
                .unwrap()
                .catch((err: unknown) =>
                  toast({ title: "Couldn't update the order", description: getErrorMessage(err), variant: "danger" }),
                )
            }
          >
            {next.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Only ever mounted while `activeDeliveries.length > 0` (see below) — this makes React's own
 * unmount lifecycle the trigger for stopping the browser's GPS watch, instead of a separate
 * effect that watches a delivery count and calls setState from inside an effect body (which
 * the React Compiler's `set-state-in-effect` rule flags — see frontend/CLAUDE.md).
 */
function LocationSharingToggle() {
  const socket = useSocket();
  const [sharingLocation, setSharingLocation] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  function stopSharingLocation() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharingLocation(false);
  }

  function startSharingLocation() {
    if (!navigator.geolocation) {
      setGeoError("Your browser doesn't support location sharing.");
      return;
    }
    setGeoError(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        socket?.emit("rider:locationUpdate", {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => setGeoError("Couldn't get your location — check your browser's location permission."),
      { enableHighAccuracy: true },
    );
    setSharingLocation(true);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-sm text-text">Share live location</span>
        <Switch
          label="Share live location"
          checked={sharingLocation}
          onChange={(checked) => (checked ? startSharingLocation() : stopSharingLocation())}
        />
      </div>
      {geoError && <Alert variant="danger">{geoError}</Alert>}
    </>
  );
}

function RiderDashboard() {
  const { data: rider, isLoading: loadingProfile } = useGetMyRiderProfileQuery();
  const { data: queue, isLoading: loadingQueue, refetch: refetchQueue } = useGetRiderQueueQuery();
  const { data: myDeliveries, refetch: refetchDeliveries } = useGetMyDeliveriesQuery();
  const [toggleOnline, { isLoading: toggling }] = useToggleRiderOnlineMutation();
  const { toast } = useToast();
  const socket = useSocket();
  const activeDeliveries = (myDeliveries ?? []).filter((o) => ACTIVE_RIDER_STATUSES.includes(o.status));

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      void refetchQueue();
      void refetchDeliveries();
    };
    // A generic order-status event is enough to know it's worth refetching — the location
    // broadcast (docs/ROADMAP.md FDP-17) is purely one-way (rider -> customer), it never needs
    // to trigger a rider-side refetch.
    socket.on("order:statusChanged", handleUpdate);
    return () => {
      socket.off("order:statusChanged", handleUpdate);
    };
  }, [socket, refetchQueue, refetchDeliveries]);

  if (loadingProfile) return <Skeleton className="h-64 w-full" />;
  if (!rider) {
    return (
      <EmptyState
        title="No rider profile yet"
        description="Apply to become a rider to see your dashboard."
        action={
          <NextLink href="/rider/apply" className={buttonVariants({ variant: "primary" })}>
            Apply now
          </NextLink>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {!rider.isVerified && (
        <Alert variant="warning">
          Your rider account is pending verification. You can browse the queue, but you can&apos;t
          accept deliveries yet.
        </Alert>
      )}

      <Card>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text">
              {rider.isOnline ? "You're online" : "You're offline"}
            </span>
            <span className="text-sm text-text-muted">
              Go online to appear available for new deliveries.
            </span>
          </div>
          <Switch
            label="Online"
            checked={rider.isOnline}
            disabled={toggling}
            onChange={() =>
              void toggleOnline()
                .unwrap()
                .catch((err: unknown) =>
                  toast({ title: "Couldn't update status", description: getErrorMessage(err), variant: "danger" }),
                )
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-text">Your rating</span>
          <div className="flex items-center gap-2">
            <Rating value={rider.rating} label="Your rating" />
            <span className="text-sm text-text-muted">
              {rider.rating.toFixed(1)} ({rider.reviewCount} {rider.reviewCount === 1 ? "review" : "reviews"})
            </span>
          </div>
        </CardContent>
      </Card>

      {activeDeliveries.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-text">Your active deliveries</h2>
            <LocationSharingToggle />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeDeliveries.map((order) => (
              <ActiveDeliveryCard key={order._id} order={order} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text">Unassigned orders</h2>
        {loadingQueue ? (
          <Skeleton className="h-32 w-full" />
        ) : !queue || queue.length === 0 ? (
          <EmptyState title="No orders waiting" description="New ready-for-pickup orders will appear here." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {queue.map((order) => (
              <QueueCard key={order._id} order={order} verified={rider.isVerified} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RiderDashboardPage() {
  return (
    <RequireRole roles={["rider"]}>
      <Container className="flex flex-col gap-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text">Rider dashboard</h1>
          <NextLink href="/rider/deliveries" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Delivery history
          </NextLink>
        </div>
        <RiderDashboard />
      </Container>
    </RequireRole>
  );
}
