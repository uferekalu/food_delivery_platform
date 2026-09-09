"use client";

import { useTranslations, useLocale } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { useGetActivePromoCodesQuery } from "@/lib/redux/services/promo-codes-api";
import { formatMoney } from "@/lib/currency";

/**
 * "Use code X for Y% off" discovery banner (docs/ROADMAP.md FDP-112) — until now a promo code
 * only worked if a customer already knew it existed (shared externally, or guessed). Shown on
 * a restaurant/store's public page for any currently-usable code: platform-wide, or scoped to
 * this exact business. Renders nothing while loading or when there's nothing active, rather than
 * a loading skeleton — this is a bonus, not a page section a visitor is ever left waiting on.
 */
export function PromoBanner({
  restaurantId,
  storeId,
  currency,
}: {
  restaurantId?: string;
  storeId?: string;
  currency: string;
}) {
  const t = useTranslations("PromoBanner");
  const locale = useLocale();
  const { data } = useGetActivePromoCodesQuery(
    restaurantId ? { restaurantId } : { storeId: storeId! },
  );

  if (!data || data.length === 0) return null;

  return (
    <Alert variant="success" title={t("title")}>
      <ul className="flex flex-col gap-1">
        {data.map((promo) => (
          <li key={promo._id}>
            {t("useCodeFor", {
              code: promo.code,
              discount:
                promo.discountType === "percentage"
                  ? t("percentOff", { value: promo.discountValue })
                  : t("amountOff", { value: formatMoney(promo.discountValue, currency, locale) }),
            })}
            {promo.minOrderAmount > 0
              ? ` ${t("minOrder", { amount: formatMoney(promo.minOrderAmount, currency, locale) })}`
              : ""}
          </li>
        ))}
      </ul>
    </Alert>
  );
}
