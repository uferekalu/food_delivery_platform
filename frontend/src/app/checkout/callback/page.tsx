"use client";

import { Suspense, useEffect } from "react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { useGetOrderQuery } from "@/lib/redux/services/orders-api";
import { useSocket } from "@/hooks/use-socket";
import { getErrorMessage } from "@/lib/redux/error";
import type { Order } from "@/lib/redux/restaurant-types";

/** Polling fallback in case the socket event is missed (e.g. a brief disconnect) — the webhook
 * itself is always the source of truth for payment state, this is just how the UI notices. */
const POLL_INTERVAL_MS = 3000;

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const cancelled = searchParams.get("cancelled") === "true";
  const socket = useSocket();

  // Stopping polling on a failed payment needs last render's data, which isn't available yet
  // at the point pollingInterval is passed to the same hook call producing it — so polling only
  // reacts to `cancelled` (known upfront from the URL); `showRetry` below still reacts to a
  // failed payment immediately for display purposes even while the background poll winds down.
  const { data: order, error, refetch } = useGetOrderQuery(orderId ?? "", {
    skip: !orderId,
    pollingInterval: cancelled ? 0 : POLL_INTERVAL_MS,
  });
  const showRetry = cancelled || order?.paymentStatus === "failed";

  useEffect(() => {
    if (!socket || !orderId) return;
    socket.emit("order:subscribe", { orderId });

    const handleStatusChanged = (updated: Order) => {
      if (updated._id === orderId) void refetch();
    };
    socket.on("order:statusChanged", handleStatusChanged);
    return () => {
      socket.off("order:statusChanged", handleStatusChanged);
    };
  }, [socket, orderId, refetch]);

  // A real external-system side effect (navigation), not a state mirror — stays in an effect.
  useEffect(() => {
    if (order && order.status !== "PENDING_PAYMENT") {
      router.replace(`/orders/${order._id}`);
    }
  }, [order, router]);

  if (!orderId) {
    return <Alert variant="danger">Missing order — go back to checkout and try again.</Alert>;
  }

  if (error) {
    return <Alert variant="danger">{getErrorMessage(error, "Couldn't load your order")}</Alert>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{showRetry ? "Payment not completed" : "Confirming your payment…"}</CardTitle>
        <CardDescription>
          {showRetry
            ? "Your payment was cancelled or didn't go through. Nothing has been charged."
            : "This usually takes a few seconds. This page will move on automatically."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 py-6">
        {showRetry ? (
          <NextLink href="/checkout" className={buttonVariants({ variant: "primary" })}>
            Back to checkout
          </NextLink>
        ) : (
          <>
            <Spinner size="lg" label="Confirming payment" />
            <Button variant="ghost" size="sm" onClick={() => void refetch()}>
              Check again
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** `useSearchParams()` requires a `Suspense` boundary — see register/page.tsx for the same
 * pattern. */
export default function CheckoutCallbackPage() {
  return (
    <Container className="max-w-lg py-10">
      <Suspense
        fallback={
          <div className="flex justify-center py-24">
            <Spinner size="lg" label="Loading" />
          </div>
        }
      >
        <CallbackContent />
      </Suspense>
    </Container>
  );
}
