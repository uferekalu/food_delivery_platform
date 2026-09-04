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
import { useToast } from "@/components/ui/toast";
import { useLazyGetOrderAsAdminQuery, useRefundOrderMutation } from "@/lib/redux/services/admin-api";
import { getErrorMessage } from "@/lib/redux/error";
import { formatMoney } from "@/lib/currency";

export function RefundsTab() {
  const t = useTranslations("AdminRefundsTab");
  const tStatus = useTranslations("OrderStatus");
  const locale = useLocale();
  const [orderId, setOrderId] = useState("");
  const [lookupOrder, { data: order, isFetching, isError }] = useLazyGetOrderAsAdminQuery();
  const [refundOrder, { isLoading: refunding }] = useRefundOrderMutation();
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();

  const refundable = order?.status === "DELIVERED" && order.paymentStatus === "succeeded";

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
            {!refundable && <Alert variant="warning">{t("onlyDeliveredCanBeRefunded")}</Alert>}
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
    </div>
  );
}
