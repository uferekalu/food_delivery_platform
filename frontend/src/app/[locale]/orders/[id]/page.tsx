"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { LiveDeliveryMap, type LatLng } from "@/components/live-delivery-map";
import { ReviewForm } from "@/components/review-form";
import { useAppSelector } from "@/lib/redux/hooks";
import { useGetOrderQuery } from "@/lib/redux/services/orders-api";
import { useVerifyPaymentMutation } from "@/lib/redux/services/payments-api";
import { useGetReviewEligibilityQuery } from "@/lib/redux/services/reviews-api";
import { getErrorMessage } from "@/lib/redux/error";
import { useSocket } from "@/hooks/use-socket";
import type { Order, OrderStatus } from "@/lib/redux/restaurant-types";

// The Stepper collapses these into one "Out for delivery" milestone, but the map should still
// render for all three — a rider's GPS ping is meaningful from the moment they're assigned.
const ACTIVE_DELIVERY_STATUSES: OrderStatus[] = ["ASSIGNED_TO_RIDER", "PICKED_UP", "OUT_FOR_DELIVERY"];

const TRACKING_STEP_KEYS: OrderStatus[] = [
  "PLACED",
  "ACCEPTED_BY_RESTAURANT",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

// ASSIGNED_TO_RIDER/PICKED_UP fold into the "Out for delivery" milestone — an internal
// dispatch detail the customer-facing stepper doesn't need its own step for.
const STEP_COLLAPSE: Partial<Record<OrderStatus, OrderStatus>> = {
  ASSIGNED_TO_RIDER: "OUT_FOR_DELIVERY",
  PICKED_UP: "OUT_FOR_DELIVERY",
};

function trackingStepIndex(status: OrderStatus): number {
  const key = STEP_COLLAPSE[status] ?? status;
  return TRACKING_STEP_KEYS.findIndex((step) => step === key);
}

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

function OrderReviews({ order }: { order: Order }) {
  const t = useTranslations("OrderDetailPage");
  const { data: eligibility, isLoading } = useGetReviewEligibilityQuery(order._id);

  if (isLoading || !eligibility) return null;
  if (!eligibility.restaurant && !eligibility.rider) return null;

  return (
    <div className="flex flex-col gap-4">
      {eligibility.restaurant && (
        <ReviewForm orderId={order._id} targetType="restaurant" title={t("rateThisRestaurant")} />
      )}
      {eligibility.rider && <ReviewForm orderId={order._id} targetType="rider" title={t("rateYourRider")} />}
    </div>
  );
}

function PendingPaymentAlert({ orderId, refetch }: { orderId: string; refetch: () => void }) {
  const t = useTranslations("OrderDetailPage");
  const [verifyPayment, { isLoading }] = useVerifyPaymentMutation();

  function checkNow() {
    verifyPayment(orderId)
      .unwrap()
      .then(() => refetch())
      .catch(() => {
        // Swallow — same reasoning as the checkout callback page: a transient check failure
        // isn't worth surfacing here, the customer can just try again.
      });
  }

  return (
    <Alert variant="warning" title={t("paymentNotYetConfirmed")}>
      <div className="flex flex-col items-start gap-3">
        <p>{t("paymentNotConfirmedDescription")}</p>
        <Button size="sm" variant="outline" onClick={checkNow} isLoading={isLoading}>
          {t("checkPaymentStatus")}
        </Button>
      </div>
    </Alert>
  );
}

function OrderSummary({
  order,
  riderLocation,
  refetch,
}: {
  order: Order;
  riderLocation: LatLng | null;
  refetch: () => void;
}) {
  const t = useTranslations("OrderDetailPage");
  const tStatus = useTranslations("OrderStatus");
  const trackingSteps: StepperStep[] = TRACKING_STEP_KEYS.map((key) => ({ key, label: tStatus(key) }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">{order.orderNumber}</h1>
          <p className="text-sm text-text-muted">{t("placedOn", { date: new Date(order.createdAt).toLocaleString() })}</p>
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[order.status]}>{tStatus(order.status)}</Badge>
      </div>

      {order.status === "PENDING_PAYMENT" && <PendingPaymentAlert orderId={order._id} refetch={refetch} />}

      {(order.status === "CANCELLED" || order.status === "REFUNDED") && (
        <Alert variant={order.status === "CANCELLED" ? "danger" : "neutral"} title={tStatus(order.status)}>
          {order.status === "CANCELLED" ? t("orderCancelledDescription") : t("orderRefundedDescription")}
        </Alert>
      )}

      {trackingStepIndex(order.status) >= 0 && (
        <Card>
          <CardContent>
            <Stepper steps={trackingSteps} currentIndex={trackingStepIndex(order.status)} />
          </CardContent>
        </Card>
      )}

      {ACTIVE_DELIVERY_STATUSES.includes(order.status) && (
        <LiveDeliveryMap
          riderLocation={riderLocation}
          destination={
            order.deliveryAddress.lat != null && order.deliveryAddress.lng != null
              ? { lat: order.deliveryAddress.lat, lng: order.deliveryAddress.lng }
              : null
          }
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("items")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {order.items.map((item, index) => (
            <div key={`${item.menuItemId}-${index}`} className="flex items-start justify-between gap-3 text-sm">
              <div className="flex items-start gap-3">
                {item.imageUrl ? (
                  // A small order-item thumbnail doesn't warrant next/image's layout machinery.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className="size-12 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="size-12 shrink-0 rounded-md bg-secondary" />
                )}
                <div className="flex flex-col">
                  <span className="text-text">
                    {item.qty}× {item.name}
                  </span>
                  {item.selectedModifiers.length > 0 && (
                    <span className="text-xs text-text-muted">
                      {item.selectedModifiers.map((m) => m.optionName).join(", ")}
                    </span>
                  )}
                  {item.notes && <span className="text-xs text-text-muted italic">&quot;{item.notes}&quot;</span>}
                </div>
              </div>
              <span className="text-text-muted">
                {order.currency} {((item.price + item.selectedModifiers.reduce((s, m) => s + m.priceDelta, 0)) * item.qty).toFixed(2)}
              </span>
            </div>
          ))}
          <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
            <div className="flex items-center justify-between text-text-muted">
              <span>{t("subtotal")}</span>
              <span>
                {order.currency} {order.subtotal.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-text-muted">
              <span>{t("deliveryFee")}</span>
              <span>
                {order.currency} {order.deliveryFee.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-text-muted">
              <span>{t("serviceFee")}</span>
              <span>
                {order.currency} {order.serviceFee.toFixed(2)}
              </span>
            </div>
            {order.discount > 0 && (
              <div className="flex items-center justify-between text-success">
                <span>{order.promoCode ? t("discountWithCode", { code: order.promoCode }) : t("discount")}</span>
                <span>
                  -{order.currency} {order.discount.toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-text">
              <span>{t("total")}</span>
              <span>
                {order.currency} {order.total.toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("deliveryDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-text">
          <p>
            {order.deliveryAddress.line1}
            {order.deliveryAddress.line2 ? `, ${order.deliveryAddress.line2}` : ""}
          </p>
          <p>
            {order.deliveryAddress.city}, {order.deliveryAddress.state}
            {order.deliveryAddress.postalCode ? ` ${order.deliveryAddress.postalCode}` : ""}
          </p>
          {order.deliveryInstructions && <p className="text-text-muted">&quot;{order.deliveryInstructions}&quot;</p>}
          <p className="text-text-muted">
            {order.scheduledFor
              ? t("scheduledFor", { date: new Date(order.scheduledFor).toLocaleString() })
              : t("asSoonAsPossible")}
          </p>
        </CardContent>
      </Card>

      {order.status === "DELIVERED" && <OrderReviews order={order} />}
    </div>
  );
}

function OrderDetail({ id }: { id: string }) {
  const t = useTranslations("OrderDetailPage");
  const { data: order, isLoading, error, refetch } = useGetOrderQuery(id);
  const socket = useSocket();
  const [riderLocation, setRiderLocation] = useState<LatLng | null>(null);

  useEffect(() => {
    if (!socket) return;
    socket.emit("order:subscribe", { orderId: id });

    const handleStatusChanged = (updated: Order) => {
      if (updated._id === id) void refetch();
    };
    const handleRiderLocation = (location: LatLng) => setRiderLocation(location);
    socket.on("order:statusChanged", handleStatusChanged);
    socket.on("order:riderLocation", handleRiderLocation);
    return () => {
      socket.off("order:statusChanged", handleStatusChanged);
      socket.off("order:riderLocation", handleRiderLocation);
    };
  }, [socket, id, refetch]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" label={t("loadingYourOrder")} />
      </div>
    );
  }

  if (error || !order) {
    return <Alert variant="danger">{getErrorMessage(error, t("orderNotFound"))}</Alert>;
  }

  return <OrderSummary order={order} riderLocation={riderLocation} refetch={refetch} />;
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations("OrderDetailPage");
  const { id } = use(params);
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
          title={t("logInToViewOrder")}
          description={t("needToBeLoggedInOrderDetails")}
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
      <OrderDetail id={id} />
    </Container>
  );
}
