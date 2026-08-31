"use client";

import { use, useEffect, useState } from "react";
import NextLink from "next/link";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { LiveDeliveryMap, type LatLng } from "@/components/live-delivery-map";
import { ReviewForm } from "@/components/review-form";
import { useAppSelector } from "@/lib/redux/hooks";
import { useGetOrderQuery } from "@/lib/redux/services/orders-api";
import { useGetReviewEligibilityQuery } from "@/lib/redux/services/reviews-api";
import { getErrorMessage } from "@/lib/redux/error";
import { useSocket } from "@/hooks/use-socket";
import type { Order, OrderStatus } from "@/lib/redux/restaurant-types";

// The Stepper collapses these into one "Out for delivery" milestone, but the map should still
// render for all three — a rider's GPS ping is meaningful from the moment they're assigned.
const ACTIVE_DELIVERY_STATUSES: OrderStatus[] = ["ASSIGNED_TO_RIDER", "PICKED_UP", "OUT_FOR_DELIVERY"];

const TRACKING_STEPS: StepperStep[] = [
  { key: "PLACED", label: "Order placed" },
  { key: "ACCEPTED_BY_RESTAURANT", label: "Accepted" },
  { key: "PREPARING", label: "Preparing" },
  { key: "READY_FOR_PICKUP", label: "Ready for pickup" },
  { key: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { key: "DELIVERED", label: "Delivered" },
];

// ASSIGNED_TO_RIDER/PICKED_UP fold into the "Out for delivery" milestone — an internal
// dispatch detail the customer-facing stepper doesn't need its own step for.
const STEP_COLLAPSE: Partial<Record<OrderStatus, string>> = {
  ASSIGNED_TO_RIDER: "OUT_FOR_DELIVERY",
  PICKED_UP: "OUT_FOR_DELIVERY",
};

function trackingStepIndex(status: OrderStatus): number {
  const key = STEP_COLLAPSE[status] ?? status;
  return TRACKING_STEPS.findIndex((step) => step.key === key);
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

function formatStatus(status: OrderStatus): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function OrderReviews({ order }: { order: Order }) {
  const { data: eligibility, isLoading } = useGetReviewEligibilityQuery(order._id);

  if (isLoading || !eligibility) return null;
  if (!eligibility.restaurant && !eligibility.rider) return null;

  return (
    <div className="flex flex-col gap-4">
      {eligibility.restaurant && (
        <ReviewForm orderId={order._id} targetType="restaurant" title="Rate this restaurant" />
      )}
      {eligibility.rider && <ReviewForm orderId={order._id} targetType="rider" title="Rate your rider" />}
    </div>
  );
}

function OrderSummary({ order, riderLocation }: { order: Order; riderLocation: LatLng | null }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">{order.orderNumber}</h1>
          <p className="text-sm text-text-muted">Placed {new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[order.status]}>{formatStatus(order.status)}</Badge>
      </div>

      {order.status === "PENDING_PAYMENT" && (
        <Alert variant="info" title="Payment coming soon">
          Your order has been placed and is waiting on payment integration — nothing has been charged yet.
        </Alert>
      )}

      {(order.status === "CANCELLED" || order.status === "REFUNDED") && (
        <Alert variant={order.status === "CANCELLED" ? "danger" : "neutral"} title={formatStatus(order.status)}>
          {order.status === "CANCELLED"
            ? "This order was cancelled and is no longer being prepared."
            : "This order was refunded."}
        </Alert>
      )}

      {trackingStepIndex(order.status) >= 0 && (
        <Card>
          <CardContent>
            <Stepper steps={TRACKING_STEPS} currentIndex={trackingStepIndex(order.status)} />
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
          <CardTitle>Items</CardTitle>
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
              <span>Subtotal</span>
              <span>
                {order.currency} {order.subtotal.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-text-muted">
              <span>Delivery fee</span>
              <span>
                {order.currency} {order.deliveryFee.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-text-muted">
              <span>Service fee</span>
              <span>
                {order.currency} {order.serviceFee.toFixed(2)}
              </span>
            </div>
            {order.discount > 0 && (
              <div className="flex items-center justify-between text-success">
                <span>Discount{order.promoCode ? ` (${order.promoCode})` : ""}</span>
                <span>
                  -{order.currency} {order.discount.toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-text">
              <span>Total</span>
              <span>
                {order.currency} {order.total.toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery details</CardTitle>
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
              ? `Scheduled for ${new Date(order.scheduledFor).toLocaleString()}`
              : "As soon as possible"}
          </p>
        </CardContent>
      </Card>

      {order.status === "DELIVERED" && <OrderReviews order={order} />}
    </div>
  );
}

function OrderDetail({ id }: { id: string }) {
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
        <Spinner size="lg" label="Loading your order" />
      </div>
    );
  }

  if (error || !order) {
    return <Alert variant="danger">{getErrorMessage(error, "Order not found, or you don't have access to it.")}</Alert>;
  }

  return <OrderSummary order={order} riderLocation={riderLocation} />;
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
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
          title="Log in to view this order"
          description="You'll need to be logged in to see order details."
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
      <OrderDetail id={id} />
    </Container>
  );
}
