"use client";

import { useState } from "react";
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

export function RefundsTab() {
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
        toast({ title: "Order refunded", variant: "success" });
      })
      .catch((err: unknown) => {
        setConfirming(false);
        toast({ title: "Couldn't refund order", description: getErrorMessage(err), variant: "danger" });
      });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Look up an order</CardTitle>
          <CardDescription>Paste an order ID to review it and issue a refund for a delivered order.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (orderId.trim()) void lookupOrder(orderId.trim());
            }}
          >
            <FormField label="Order ID" className="flex-1">
              <Input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="6a8c..." />
            </FormField>
            <Button type="submit" isLoading={isFetching}>
              Look up
            </Button>
          </form>
        </CardContent>
      </Card>

      {isError && <Alert variant="danger">Couldn&apos;t find an order with that ID.</Alert>}

      {order && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-text">{order.orderNumber}</span>
              <Badge variant={order.status === "REFUNDED" ? "neutral" : "info"}>{order.status}</Badge>
            </div>
            <p className="text-sm text-text-muted">
              {order.currency} {order.total.toFixed(2)} · payment {order.paymentStatus}
              {order.paymentRef ? ` · ref ${order.paymentRef}` : ""}
            </p>
            {!refundable && (
              <Alert variant="warning">
                Only a delivered order with a successful payment can be refunded.
              </Alert>
            )}
            <Button
              variant="destructive"
              className="self-start"
              disabled={!refundable}
              isLoading={refunding}
              onClick={() => setConfirming(true)}
            >
              Refund order
            </Button>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={confirmRefund}
        title={order ? `Refund order ${order.orderNumber}?` : "Refund this order?"}
        description={
          order
            ? `This charges back ${order.currency} ${order.total.toFixed(2)} to the customer and can't be undone.`
            : undefined
        }
        confirmLabel="Refund"
        isLoading={refunding}
      />
    </div>
  );
}
