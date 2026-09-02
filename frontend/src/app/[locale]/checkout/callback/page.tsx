"use client";

import { Suspense, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useRouter, useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { useGetOrderQuery } from "@/lib/redux/services/orders-api";
import { useVerifyPaymentMutation } from "@/lib/redux/services/payments-api";
import { useSocket } from "@/hooks/use-socket";
import { getErrorMessage } from "@/lib/redux/error";
import type { Order } from "@/lib/redux/restaurant-types";

/** Polling fallback in case the socket event is missed (e.g. a brief disconnect) — the webhook
 * itself is always the source of truth for payment state, this is just how the UI notices. */
const POLL_INTERVAL_MS = 3000;

function CallbackContent() {
  const t = useTranslations("CheckoutCallbackPage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const cancelled = searchParams.get("cancelled") === "true";
  const socket = useSocket();
  const [verifyPayment] = useVerifyPaymentMutation();
  const verifyAttempted = useRef(false);

  // Stopping polling on a failed payment needs last render's data, which isn't available yet
  // at the point pollingInterval is passed to the same hook call producing it — so polling only
  // reacts to `cancelled` (known upfront from the URL); `showRetry` below still reacts to a
  // failed payment immediately for display purposes even while the background poll winds down.
  const { data: order, error, refetch } = useGetOrderQuery(orderId ?? "", {
    skip: !orderId,
    pollingInterval: cancelled ? 0 : POLL_INTERVAL_MS,
  });
  const showRetry = cancelled || order?.paymentStatus === "failed";

  // Actively asks the provider directly (PaymentsService.verifyPayment) rather than only ever
  // waiting on the passive webhook — otherwise a customer landing here after a real payment
  // could be stuck on "Confirming your payment…" forever if webhook delivery never reaches this
  // deploy. Skipped for a cancelled return trip (nothing to verify) and only ever attempted once
  // per mount; "Check again" re-triggers it explicitly.
  const verifyNow = useCallback(() => {
    if (!orderId) return;
    verifyPayment(orderId)
      .unwrap()
      .then(() => refetch())
      .catch(() => {
        // Swallow — the passive poll/socket path below still covers it, and a transient verify
        // failure (e.g. the provider's own API briefly erroring) isn't worth surfacing here.
      });
  }, [orderId, verifyPayment, refetch]);

  useEffect(() => {
    if (cancelled || verifyAttempted.current || !orderId) return;
    verifyAttempted.current = true;
    verifyNow();
  }, [cancelled, orderId, verifyNow]);

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
    return <Alert variant="danger">{t("missingOrder")}</Alert>;
  }

  if (error) {
    return <Alert variant="danger">{getErrorMessage(error, t("couldNotLoadOrder"))}</Alert>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{showRetry ? t("paymentNotCompleted") : t("confirmingPayment")}</CardTitle>
        <CardDescription>{showRetry ? t("paymentCancelledOrFailed") : t("usuallyTakesAFewSeconds")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 py-6">
        {showRetry ? (
          <Link href="/checkout" className={buttonVariants({ variant: "primary" })}>
            {t("backToCheckout")}
          </Link>
        ) : (
          <>
            <Spinner size="lg" label={t("confirmingPaymentLabel")} />
            <Button variant="ghost" size="sm" onClick={verifyNow}>
              {t("checkAgain")}
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
  const t = useTranslations("CheckoutCallbackPage");
  return (
    <Container className="max-w-lg py-10">
      <Suspense
        fallback={
          <div className="flex justify-center py-24">
            <Spinner size="lg" label={t("loading")} />
          </div>
        }
      >
        <CallbackContent />
      </Suspense>
    </Container>
  );
}
