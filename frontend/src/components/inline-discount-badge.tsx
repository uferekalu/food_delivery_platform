"use client";

import { useTranslations, useLocale } from "next-intl";
import { useGetActivePromoCodesQuery } from "@/lib/redux/services/promo-codes-api";
import { formatMoney } from "@/lib/currency";

function TagIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M10.5 2.5h5a2 2 0 012 2v5a2 2 0 01-.586 1.414l-7 7a2 2 0 01-2.828 0l-5-5a2 2 0 010-2.828l7-7A2 2 0 0110.5 2.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="14.5" cy="6.5" r="1.25" fill="currentColor" />
    </svg>
  );
}

/**
 * An in-flow discount badge sitting directly under a restaurant/store's hero banner — the same
 * spot Glovo's own store page (docs/ROADMAP.md FDP-131 reference:
 * glovoapp.com/en/ng/lagos/stores/chicken-republic-los) shows "-30% on orders over ₦3,000".
 * `PromoTicker` stays exactly as-is everywhere else (it's deliberately `position: fixed`, out of
 * document flow, for the marketplace-wide/floating case) — this is a second, purely visual
 * treatment of the SAME data (`useGetActivePromoCodesQuery`, same "PromoTicker" i18n headline
 * strings) rendered inline instead, so the two surfaces can never say something different about
 * an active code even though they look different. Renders nothing when there's no active code —
 * same "presence is the signal" posture as every other conditional promo UI in this app.
 */
export function InlineDiscountBadge({
  restaurantId,
  storeId,
  currency,
}: {
  restaurantId?: string;
  storeId?: string;
  currency: string;
}) {
  const t = useTranslations("PromoTicker");
  const locale = useLocale();
  const { data } = useGetActivePromoCodesQuery(
    restaurantId ? { restaurantId } : storeId ? { storeId } : {},
  );

  const promo = data?.[0];
  if (!promo) return null;

  const headline =
    promo.discountType === "percentage"
      ? t("percentHeadline", { value: promo.discountValue })
      : t("amountHeadline", { value: formatMoney(promo.discountValue, currency, locale) });

  return (
    <div className="flex w-fit flex-wrap items-center gap-2 rounded-full border border-primary/30 bg-primary-subtle py-1.5 pr-3 pl-2 text-sm">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-text-on-primary">
        <TagIcon className="size-3" />
      </span>
      <span className="font-medium text-primary-subtle-foreground">{headline}</span>
      {promo.minOrderAmount > 0 && (
        <span className="text-primary-subtle-foreground/80">
          {t("minOrderNote", { amount: formatMoney(promo.minOrderAmount, currency, locale) })}
        </span>
      )}
      <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 font-mono text-xs font-bold tracking-wide text-text-on-primary">
        {promo.code}
      </span>
    </div>
  );
}
