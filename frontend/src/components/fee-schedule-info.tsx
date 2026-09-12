"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { useGetFeeScheduleQuery } from "@/lib/redux/services/orders-api";

// "How fees work" reference blurb shown before both the admin transactions ledger and a vendor's
// sales-report transactions list (docs/ROADMAP.md FDP-129) — direct user feedback that the
// per-transaction percentages needed explaining up front, not just listed bare in a table.
// Reads live figures from the backend (never hardcoded) so this text can never drift from what a
// real order was actually charged.
export function FeeScheduleInfo() {
  const t = useTranslations("FeeScheduleInfo");
  const { data } = useGetFeeScheduleQuery();

  if (!data) return null;

  const taxEntries = Object.entries(data.taxRatesByCurrency).sort(([a], [b]) => a.localeCompare(b));

  return (
    <Alert variant="info" title={t("title")}>
      <div className="flex flex-col gap-1">
        <p>{t("platformCommissionLine", { pct: data.platformCommissionRatePct })}</p>
        <p>{t("serviceFeeLine", { pct: data.serviceFeeRatePct })}</p>
        <p>{t("deliveryFeeLine")}</p>
        <p>
          {t("taxLineIntro")}{" "}
          {taxEntries.map(([currency, pct], i) => (
            <span key={currency}>
              {currency} {pct}%{i < taxEntries.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
        <p className="text-xs opacity-80">{t("note")}</p>
      </div>
    </Alert>
  );
}
