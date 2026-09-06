"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  useLazyGetOrderAsAdminQuery,
  useRefundOrderMutation,
  useGetOrdersNeedingRefundAttentionQuery,
  useResolveRefundReconciliationMutation,
} from "@/lib/redux/services/admin-api";
import type { Order } from "@/lib/redux/restaurant-types";
import { getErrorMessage } from "@/lib/redux/error";
import { formatMoney } from "@/lib/currency";

// Refund-hardening pass (docs/ROADMAP.md FDP-104) — mirrors PayoutsTab's own
// ResolveReconciliationModal shape (payouts-tab.tsx) for the refund-side equivalent.
function ResolveRefundReconciliationModal({
  order,
  open,
  onClose,
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("AdminRefundsTab");
  const locale = useLocale();
  const { toast } = useToast();
  const [resolve, { isLoading }] = useResolveRefundReconciliationMutation();

  async function handleResolve(refundActuallySucceeded: boolean) {
    if (!order) return;
    try {
      await resolve({ orderId: order._id, refundActuallySucceeded }).unwrap();
      toast({ title: t("reconciliationResolved"), variant: "success" });
      onClose();
    } catch (err) {
      toast({ title: t("couldNotResolve"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  if (!order) return null;

  return (
    <Modal open={open} onClose={onClose} title={t("resolveReconciliationTitle")}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          {t("resolveReconciliationDescription", {
            orderNumber: order.orderNumber,
            amount: formatMoney(order.total, order.currency, locale),
            provider: order.paymentProvider,
          })}
        </p>
        <Alert variant="warning">{t("checkProviderDashboardFirst", { provider: order.paymentProvider })}</Alert>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1"
            isLoading={isLoading}
            onClick={() => void handleResolve(false)}
          >
            {t("refundDidNotHappen")}
          </Button>
          <Button className="flex-1" isLoading={isLoading} onClick={() => void handleResolve(true)}>
            {t("refundDidHappen")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function NeedsAttentionRow({
  order,
  onResolve,
  onRefund,
}: {
  order: Order;
  onResolve: (o: Order) => void;
  onRefund: (o: Order) => void;
}) {
  const t = useTranslations("AdminRefundsTab");
  const tStatus = useTranslations("OrderStatus");
  const locale = useLocale();

  return (
    <div className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-text">{order.orderNumber}</span>
        <span className="text-xs text-text-muted">
          {formatMoney(order.total, order.currency, locale)} · {order.paymentProvider}
        </span>
        {order.refundFailureReason && (
          <span className="text-xs text-danger">{order.refundFailureReason}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Badge variant={order.refundReconciliationRequired ? "danger" : "warning"}>
          {tStatus(order.status)}
        </Badge>
        {order.refundReconciliationRequired ? (
          <Button size="sm" variant="destructive" onClick={() => onResolve(order)}>
            {t("resolve")}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onRefund(order)}>
            {t("refundOrder")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function RefundsTab() {
  const t = useTranslations("AdminRefundsTab");
  const tStatus = useTranslations("OrderStatus");
  const locale = useLocale();
  const [orderId, setOrderId] = useState("");
  const [lookupOrder, { data: order, isFetching, isError }] = useLazyGetOrderAsAdminQuery();
  const [refundOrder, { isLoading: refunding }] = useRefundOrderMutation();
  const [confirming, setConfirming] = useState(false);
  const [resolvingOrder, setResolvingOrder] = useState<Order | null>(null);
  const [confirmingAttentionOrder, setConfirmingAttentionOrder] = useState<Order | null>(null);
  const { toast } = useToast();
  const { data: needsAttention, isLoading: loadingAttention } = useGetOrdersNeedingRefundAttentionQuery();

  // docs/ROADMAP.md FDP-104: the backend has allowed refunding a CANCELLED order with a
  // succeeded payment since FDP-65 (an order cancelled after payment succeeds but before
  // delivery) — this check previously only allowed DELIVERED, so an admin had no way to refund
  // that case through this UI at all despite the API supporting it.
  const refundable =
    (order?.status === "DELIVERED" || order?.status === "CANCELLED") &&
    order.paymentStatus === "succeeded" &&
    !order.refundReconciliationRequired;

  async function confirmRefundFromAttentionList() {
    if (!confirmingAttentionOrder) return;
    try {
      await refundOrder(confirmingAttentionOrder._id).unwrap();
      toast({ title: t("orderRefunded"), variant: "success" });
      setConfirmingAttentionOrder(null);
    } catch (err) {
      toast({ title: t("couldNotRefundOrder"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  function confirmRefund() {
    if (!order) return;
    void refundOrder(order._id)
      .unwrap()
      .then(() => {
        setConfirming(false);
        toast({ title: t("orderRefunded"), variant: "success" });
      })
      .catch((err: unknown) => {
        setConfirming(false);
        toast({ title: t("couldNotRefundOrder"), description: getErrorMessage(err), variant: "danger" });
      });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("needsAttention")}</CardTitle>
          <CardDescription>{t("needsAttentionDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAttention ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !needsAttention || needsAttention.length === 0 ? (
            <EmptyState title={t("nothingNeedsAttention")} description={t("nothingNeedsAttentionDescription")} />
          ) : (
            needsAttention.map((o) => (
              <NeedsAttentionRow
                key={o._id}
                order={o}
                onResolve={setResolvingOrder}
                onRefund={setConfirmingAttentionOrder}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("lookUpAnOrder")}</CardTitle>
          <CardDescription>{t("lookUpDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (orderId.trim()) void lookupOrder(orderId.trim());
            }}
          >
            <FormField label={t("orderId")} className="flex-1">
              <Input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="6a8c..." />
            </FormField>
            <Button type="submit" isLoading={isFetching}>
              {t("lookUp")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isError && <Alert variant="danger">{t("couldNotFindOrder")}</Alert>}

      {order && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-text">{order.orderNumber}</span>
              <Badge variant={order.status === "REFUNDED" ? "neutral" : "info"}>{tStatus(order.status)}</Badge>
            </div>
            <p className="text-sm text-text-muted">
              {t("orderSummary", { total: formatMoney(order.total, order.currency, locale), paymentStatus: order.paymentStatus })}
              {order.paymentRef ? t("refSuffix", { ref: order.paymentRef }) : ""}
            </p>
            {!refundable && (
              <Alert variant="warning">
                {order.refundReconciliationRequired
                  ? t("pendingReconciliationAlert")
                  : t("onlyDeliveredOrCancelledCanBeRefunded")}
              </Alert>
            )}
            <Button
              variant="destructive"
              className="self-start"
              disabled={!refundable}
              isLoading={refunding}
              onClick={() => setConfirming(true)}
            >
              {t("refundOrder")}
            </Button>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={confirmRefund}
        title={order ? t("refundOrderTitle", { orderNumber: order.orderNumber }) : t("refundThisOrder")}
        description={order ? t("refundOrderDescription", { total: formatMoney(order.total, order.currency, locale) }) : undefined}
        confirmLabel={t("refund")}
        isLoading={refunding}
      />

      <ConfirmDialog
        open={confirmingAttentionOrder !== null}
        onClose={() => setConfirmingAttentionOrder(null)}
        onConfirm={() => void confirmRefundFromAttentionList()}
        title={
          confirmingAttentionOrder
            ? t("refundOrderTitle", { orderNumber: confirmingAttentionOrder.orderNumber })
            : t("refundThisOrder")
        }
        description={
          confirmingAttentionOrder
            ? t("refundOrderDescription", {
                total: formatMoney(confirmingAttentionOrder.total, confirmingAttentionOrder.currency, locale),
              })
            : undefined
        }
        confirmLabel={t("refund")}
        isLoading={refunding}
      />

      <ResolveRefundReconciliationModal
        order={resolvingOrder}
        open={resolvingOrder !== null}
        onClose={() => setResolvingOrder(null)}
      />
    </div>
  );
}
