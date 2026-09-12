"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { DetailDisclosure, DetailRow } from "@/components/ui/detail-disclosure";
import { formatMoney } from "@/lib/currency";
import type { OrderStatus, OrderPaymentStatus, OrderTransaction } from "@/lib/redux/restaurant-types";

// Shared by the admin transactions ledger and a vendor's sales-report transactions list
// (docs/ROADMAP.md FDP-129/128) — one definition so the two never drift apart.
export const ORDER_STATUS_BADGE_VARIANT: Record<OrderStatus, BadgeProps["variant"]> = {
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

export const PAYMENT_STATUS_BADGE_VARIANT: Record<OrderPaymentStatus, BadgeProps["variant"]> = {
  pending: "warning",
  succeeded: "success",
  failed: "danger",
  refunded: "neutral",
};

interface OrderTransactionLabels {
  t: (key: string, values?: Record<string, string | number>) => string;
  tStatus: (key: string) => string;
  tPayment: (key: string) => string;
}

// One order's full categorical fee breakdown, rendered as a desktop table row's cells
// (docs/ROADMAP.md FDP-129) — subtotal/delivery fee/service fee/tax/discount/platform fee/vendor
// payout, each fee amount paired with the effective rate that produced it. `showVendor` is false
// on a vendor's own sales report (every row is already their own vendor, no column needed).
export function OrderTransactionRow({
  order,
  locale,
  showVendor,
  t,
  tStatus,
  tPayment,
}: { order: OrderTransaction; locale: string; showVendor: boolean } & OrderTransactionLabels) {
  const money = (value: number) => formatMoney(value, order.currency, locale);

  return (
    <>
      <td className="py-2 pr-4 whitespace-nowrap text-text">
        {new Date(order.createdAt).toLocaleDateString(locale)}
      </td>
      {showVendor && (
        <td className="py-2 pr-4 text-text">
          {order.vendor.name}
          <Badge variant="neutral" className="ml-2 align-middle">
            {order.vendor.type === "restaurant" ? t("restaurants") : t("storesVendorType")}
          </Badge>
        </td>
      )}
      <td className="py-2 pr-4 whitespace-nowrap text-text-muted">{order.orderNumber}</td>
      <td className="py-2 pr-4 text-text">{order.items.map((item) => `${item.name} ×${item.qty}`).join(", ")}</td>
      <td className="py-2 pr-4 whitespace-nowrap text-text">{money(order.subtotal)}</td>
      <td className="py-2 pr-4 whitespace-nowrap text-text">
        {money(order.deliveryFee)}
        <span className="ml-1 text-xs text-text-muted">({order.deliveryFeeSharePct}% {t("ofOrderTotal")})</span>
      </td>
      <td className="py-2 pr-4 whitespace-nowrap text-text">
        {money(order.serviceFee)}
        <span className="ml-1 text-xs text-text-muted">({order.serviceFeeRatePct}%)</span>
      </td>
      <td className="py-2 pr-4 whitespace-nowrap text-text">
        {money(order.tax)}
        <span className="ml-1 text-xs text-text-muted">({order.taxRatePct}%)</span>
      </td>
      <td className="py-2 pr-4 whitespace-nowrap text-text">{money(order.discount)}</td>
      <td className="py-2 pr-4 whitespace-nowrap text-text">
        {money(order.platformFeeAmount)}
        <span className="ml-1 text-xs text-text-muted">({order.platformFeeRatePct}%)</span>
      </td>
      <td className="py-2 pr-4 whitespace-nowrap text-text">{money(order.payoutAmount)}</td>
      <td className="py-2 pr-4 whitespace-nowrap font-medium text-text">{money(order.total)}</td>
      <td className="py-2 pr-4 whitespace-nowrap">
        <Badge variant={ORDER_STATUS_BADGE_VARIANT[order.status]}>{tStatus(order.status)}</Badge>
      </td>
      <td className="py-2 whitespace-nowrap">
        <Badge variant={PAYMENT_STATUS_BADGE_VARIANT[order.paymentStatus]}>{tPayment(order.paymentStatus)}</Badge>
      </td>
    </>
  );
}

// Mobile counterpart of OrderTransactionRow — a DetailDisclosure card instead of a wide table
// row, so an admin/vendor never has to scroll horizontally to read one transaction end to end
// (direct user feedback: horizontal scrolling on mobile "brings confusion").
export function OrderTransactionCard({
  order,
  locale,
  showVendor,
  t,
  tStatus,
  tPayment,
}: { order: OrderTransaction; locale: string; showVendor: boolean } & OrderTransactionLabels) {
  const money = (value: number) => formatMoney(value, order.currency, locale);

  return (
    <DetailDisclosure
      summary={
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-text">{money(order.total)}</span>
            <Badge variant={ORDER_STATUS_BADGE_VARIANT[order.status]}>{tStatus(order.status)}</Badge>
          </div>
          <span className="text-xs text-text-muted">
            {new Date(order.createdAt).toLocaleDateString(locale)}
            {showVendor && ` · ${order.vendor.name}`}
          </span>
        </div>
      }
    >
      <DetailRow label={t("orderNumber")} value={order.orderNumber} />
      {showVendor && (
        <DetailRow
          label={t("vendor")}
          value={`${order.vendor.name} (${order.vendor.type === "restaurant" ? t("restaurants") : t("storesVendorType")})`}
        />
      )}
      <DetailRow label={t("items")} value={order.items.map((item) => `${item.name} ×${item.qty}`).join(", ")} />
      <DetailRow label={t("subtotal")} value={money(order.subtotal)} />
      <DetailRow
        label={t("deliveryFee")}
        value={`${money(order.deliveryFee)} (${order.deliveryFeeSharePct}% ${t("ofOrderTotal")})`}
      />
      <DetailRow label={t("serviceFee")} value={`${money(order.serviceFee)} (${order.serviceFeeRatePct}%)`} />
      <DetailRow label={t("tax")} value={`${money(order.tax)} (${order.taxRatePct}%)`} />
      <DetailRow label={t("discount")} value={money(order.discount)} />
      <DetailRow
        label={t("platformFee")}
        value={`${money(order.platformFeeAmount)} (${order.platformFeeRatePct}%)`}
      />
      <DetailRow label={t("payoutToVendor")} value={money(order.payoutAmount)} />
      <DetailRow label={t("total")} value={<span className="font-semibold">{money(order.total)}</span>} />
      <DetailRow
        label={t("payment")}
        value={<Badge variant={PAYMENT_STATUS_BADGE_VARIANT[order.paymentStatus]}>{tPayment(order.paymentStatus)}</Badge>}
      />
    </DetailDisclosure>
  );
}
