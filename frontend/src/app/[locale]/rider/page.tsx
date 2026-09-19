"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
import { formatMoney } from "@/lib/currency";
import { useSocket } from "@/hooks/use-socket";
import type { Order, OrderStatus, Rider } from "@/lib/redux/restaurant-types";

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

function QueueCard({ order, verified }: { order: Order; verified: boolean }) {
  const t = useTranslations("RiderDashboardPage");
  const tStatus = useTranslations("OrderStatus");
  const locale = useLocale();
  const { toast } = useToast();
  const [assignOrder, { isLoading }] = useAssignRiderOrderMutation();
  const itemsSummary = order.items.map((item) => `${item.qty}× ${item.name}`).join(", ");

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-medium text-text">{order.orderNumber}</span>
          <Badge variant={STATUS_BADGE_VARIANT[order.status]}>{tStatus(order.status)}</Badge>
        </div>
        <p className="text-sm text-text">{itemsSummary}</p>
        {/* Backend redacts to city/state-only for an unverified rider (riders.controller.ts's
            `queue()`) — `line1` is only ever present once verified, so this branches on the
            same `verified` prop rather than just checking for the field's presence. */}
        <p className="text-sm text-text-muted">
          {verified
            ? t("deliverTo", { line1: order.deliveryAddress.line1, city: order.deliveryAddress.city })
            : t("deliverToAreaOnly", { city: order.deliveryAddress.city })}
        </p>
        <p className="text-sm font-medium text-text">
          {t("deliveryFeeAmount", { amount: formatMoney(order.deliveryFee, order.currency, locale) })}
        </p>
        <Button
          size="sm"
          disabled={!verified}
          isLoading={isLoading}
          onClick={() =>
            void assignOrder(order._id)
              .unwrap()
              .then(() => toast({ title: t("orderAccepted"), variant: "success" }))
              .catch((err: unknown) =>
                toast({ title: t("couldNotAcceptOrder"), description: getErrorMessage(err), variant: "danger" }),
              )
          }
        >
          {verified ? t("accept") : t("verificationRequired")}
        </Button>
      </CardContent>
    </Card>
  );
}

const ACTIVE_RIDER_STATUSES: OrderStatus[] = ["ASSIGNED_TO_RIDER", "PICKED_UP", "OUT_FOR_DELIVERY"];

const NEXT_RIDER_STATUS: Partial<Record<OrderStatus, { target: OrderStatus; labelKey: string }>> = {
  ASSIGNED_TO_RIDER: { target: "PICKED_UP", labelKey: "markPickedUp" },
  PICKED_UP: { target: "OUT_FOR_DELIVERY", labelKey: "markOutForDelivery" },
  OUT_FOR_DELIVERY: { target: "DELIVERED", labelKey: "markDelivered" },
};

function ActiveDeliveryCard({ order }: { order: Order }) {
  const t = useTranslations("RiderDashboardPage");
  const tStatus = useTranslations("OrderStatus");
  const { toast } = useToast();
  const [updateStatus, { isLoading }] = useUpdateRiderOrderStatusMutation();
  const itemsSummary = order.items.map((item) => `${item.qty}× ${item.name}`).join(", ");
  const next = NEXT_RIDER_STATUS[order.status];

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-medium text-text">{order.orderNumber}</span>
          <Badge variant={STATUS_BADGE_VARIANT[order.status]}>{tStatus(order.status)}</Badge>
        </div>
        <p className="text-sm text-text">{itemsSummary}</p>
        <p className="text-sm text-text-muted">
          {t("deliverTo", { line1: order.deliveryAddress.line1, city: order.deliveryAddress.city })}
        </p>
        {next && (
          <Button
            size="sm"
            isLoading={isLoading}
            onClick={() =>
              void updateStatus({ orderId: order._id, status: next.target })
                .unwrap()
                .catch((err: unknown) =>
                  toast({ title: t("couldNotUpdateOrder"), description: getErrorMessage(err), variant: "danger" }),
                )
            }
          >
            {t(next.labelKey)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function LocationDotIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M10 18s6-5.686 6-10a6 6 0 1 0-12 0c0 4.314 6 10 6 10z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

/**
 * Going online and sharing location used to be two separate switches — direct user feedback
 * (docs/ROADMAP.md FDP-134) that this was a real footgun: a rider could toggle "online" (the
 * prominent, first control) and reasonably believe they're now dispatchable, while the second,
 * easy-to-miss "Share live location" switch stayed off — invisible to nearest-rider dispatch
 * (FDP-98) AND the seller's assign-rider picker (FDP-133), which both require `currentLocation`.
 * Fixed by making "go online" itself request location, in the same click — still a single,
 * explicit user-initiated action (not an effect reacting to state, not requested on mount),
 * matching this codebase's standing "no silent geolocation prompts" rule (docs/ARCHITECTURE.md
 * §17) in spirit while removing the two-step gap. Manages both the `isOnline` mutation and the
 * GPS watch together since they now have to be coordinated by the same handler.
 */
function OnlineStatusCard({ rider }: { rider: Rider }) {
  const t = useTranslations("RiderDashboardPage");
  const { toast } = useToast();
  const socket = useSocket();
  const [toggleOnline, { isLoading: toggling }] = useToggleRiderOnlineMutation();
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
      setGeoError(t("browserDoesNotSupportLocation"));
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
      () => setGeoError(t("couldNotGetLocation")),
      { enableHighAccuracy: true },
    );
    setSharingLocation(true);
  }

  function handleToggleOnline() {
    const goingOnline = !rider.isOnline;
    void toggleOnline()
      .unwrap()
      .then(() => {
        if (goingOnline) startSharingLocation();
        else stopSharingLocation();
      })
      .catch((err: unknown) =>
        toast({ title: t("couldNotUpdateStatus"), description: getErrorMessage(err), variant: "danger" }),
      );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text">{rider.isOnline ? t("youreOnline") : t("youreOffline")}</span>
            <span className="text-sm text-text-muted">{t("goOnlineDescription")}</span>
          </div>
          <Switch label={t("online")} checked={rider.isOnline} disabled={toggling} onChange={handleToggleOnline} />
        </div>
        {rider.isOnline &&
          (sharingLocation ? (
            <p className="flex items-center gap-1.5 text-xs text-success">
              <LocationDotIcon />
              {t("sharingLocationActive")}
            </p>
          ) : (
            <div className="flex flex-col items-start gap-2 rounded-md bg-warning-bg p-3">
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <LocationDotIcon />
                {geoError ?? t("locationNotSharedWarning")}
              </p>
              <Button size="sm" variant="outline" onClick={startSharingLocation}>
                {t("enableLocationSharing")}
              </Button>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

function RiderDashboard() {
  const t = useTranslations("RiderDashboardPage");
  const { data: rider, isLoading: loadingProfile } = useGetMyRiderProfileQuery();
  const { data: queue, isLoading: loadingQueue, refetch: refetchQueue } = useGetRiderQueueQuery();
  const { data: myDeliveries, refetch: refetchDeliveries } = useGetMyDeliveriesQuery();
  const socket = useSocket();
  const activeDeliveries = (myDeliveries ?? []).filter((o) => ACTIVE_RIDER_STATUSES.includes(o.status));

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      void refetchQueue();
      void refetchDeliveries();
    };
    // Listens for "notification:new", not "order:statusChanged" (docs/ROADMAP.md FDP-135) — the
    // latter is only ever broadcast to an order's own room (`order:<id>`), which this page never
    // joins (there's no `order:subscribe` call here, unlike the customer tracking page), so that
    // listener never actually fired; this dashboard's queue/active-deliveries silently never
    // live-updated at all, not even before a reconnect. "notification:new" is broadcast to this
    // rider's own `user:<id>` room instead, which every connection joins automatically and
    // unconditionally in RealtimeGateway.handleConnection — no `:subscribe` call needed, and it's
    // rejoined on every reconnect for free. Every rider-relevant moment already sends a
    // notification (assigned, reassigned/unassigned — see OrdersService's notifyRiderAssigned/
    // notifyRiderUnassigned), so this is a reliable "something changed, worth refetching" signal
    // — the same blanket-refetch-on-any-event posture the vendor dashboard already uses.
    socket.on("notification:new", handleUpdate);
    return () => {
      socket.off("notification:new", handleUpdate);
    };
  }, [socket, refetchQueue, refetchDeliveries]);

  if (loadingProfile) return <Skeleton className="h-64 w-full" />;
  if (!rider) {
    return (
      <EmptyState
        title={t("noRiderProfileYet")}
        description={t("applyToSeeYourDashboard")}
        action={
          <Link href="/rider/apply" className={buttonVariants({ variant: "primary" })}>
            {t("applyNow")}
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {!rider.isVerified && <Alert variant="warning">{t("pendingVerificationWarning")}</Alert>}

      <OnlineStatusCard rider={rider} />

      <Card>
        <CardContent className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-text">{t("yourRating")}</span>
          <div className="flex items-center gap-2">
            <Rating value={rider.rating} label={t("yourRating")} />
            <span className="text-sm text-text-muted">
              {t("ratingWithReviewCount", { rating: rider.rating.toFixed(1), count: rider.reviewCount })}
            </span>
          </div>
        </CardContent>
      </Card>

      {activeDeliveries.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-text">{t("yourActiveDeliveries")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeDeliveries.map((order) => (
              <ActiveDeliveryCard key={order._id} order={order} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text">{t("unassignedOrders")}</h2>
        {loadingQueue ? (
          <Skeleton className="h-32 w-full" />
        ) : !queue || queue.length === 0 ? (
          <EmptyState title={t("noOrdersWaiting")} description={t("newOrdersWillAppearHere")} />
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
  const t = useTranslations("RiderDashboardPage");
  return (
    <RequireRole roles={["rider"]}>
      <Container className="flex flex-col gap-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text">{t("riderDashboard")}</h1>
          <Link href="/rider/deliveries" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("deliveryHistory")}
          </Link>
        </div>
        <RiderDashboard />
      </Container>
    </RequireRole>
  );
}
