"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/cn";
import { useGetActivePromoCodesQuery } from "@/lib/redux/services/promo-codes-api";
import { formatMoney } from "@/lib/currency";

// How long each code stays on screen before the ticker crossfades to the next one.
const ROTATE_MS = 4500;
// Must match the CSS transition duration below — the swap only happens once the fade-out
// finishes, so the incoming message never "pops" in before the outgoing one is fully gone.
const FADE_MS = 250;

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
 * Floating "what's on offer right now" ticker (docs/ROADMAP.md FDP-118, then FDP-119) — one
 * component, one visual treatment, for every place a promo code needs to surface to a customer.
 * Originally built for the marketplace-wide, seller-less case (homepage, the all-restaurants
 * listing, category pages) replacing FDP-116's plain full-width `Alert` banner after explicit
 * design feedback; then unified with the old `PromoBanner` (FDP-112, scoped to one restaurant/
 * store's own page) after equally direct follow-up feedback — the scoped case was still using
 * the old ugly full-width box and had to "look the same and beautiful" as this one. `PromoBanner`
 * itself is gone; this is now the only promo-discovery UI in the app.
 *
 * With `restaurantId`/`storeId` + `currency`, shows codes scoped to that exact business (plus
 * any platform-wide code) and can format a `fixed`-type discount as a real amount, since the
 * business's currency is known. With neither (the marketplace-wide case), shows platform-wide
 * codes only and a `fixed`-type discount gets a currency-free phrase instead of a formatted
 * amount — there's no single business/currency context spanning the whole marketplace on this
 * genuinely multi-currency platform, and guessing a currency from the visitor's locale would be
 * wrong for some fraction of visitors.
 *
 * `position: fixed` — deliberately taken out of document flow so it never adds height to the
 * page underneath it, on any of the pages that mount it (this was the actual complaint about the
 * old full-width banners: they pushed content down). Sits just under the sticky header
 * (`--z-sticky`), so it uses the next tier down (`--z-dropdown`) and a responsive top offset
 * (`HeaderSearchSlot` wraps onto its own row below `sm` on every page, so mobile needs more
 * clearance than desktop) roughly matching the header's own height; a few px of slack either way
 * is fine since this is a decorative floating element, not something that needs pixel-exact
 * alignment. The outer full-width strip is `pointer-events-none` (it must never block clicks on
 * whatever's underneath it once it's a near-empty band) with the pill itself opting back into
 * `pointer-events-auto`.
 *
 * Only ever shows one code at a time — the pill sizes to its own content, so it's exactly as wide
 * as whichever message is currently showing, then crossfades to the next (no arrows, no dots: the
 * rotation itself is the only affordance, matching the explicit "don't put forward/backward
 * arrows" feedback). A single active code just sits still; rotation only starts once there's more
 * than one to cycle through.
 */
export function PromoTicker({
  restaurantId,
  storeId,
  currency,
}: {
  restaurantId?: string;
  storeId?: string;
  currency?: string;
} = {}) {
  const t = useTranslations("PromoTicker");
  const locale = useLocale();
  const { data } = useGetActivePromoCodesQuery(
    restaurantId ? { restaurantId } : storeId ? { storeId } : {},
  );
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const count = data?.length ?? 0;

  useEffect(() => {
    if (count <= 1) return;
    let swap: ReturnType<typeof setTimeout>;
    const interval = setInterval(() => {
      setVisible(false);
      swap = setTimeout(() => {
        setIndex((i) => (i + 1) % count);
        setVisible(true);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(swap);
    };
  }, [count]);

  // A code list shorter than before (e.g. one expired mid-session) could leave `index` pointing
  // past the end — clamp defensively rather than rendering `undefined`.
  const promo = data && count > 0 ? data[index % count] : null;
  if (!promo) return null;

  const headline =
    promo.discountType === "percentage"
      ? t("percentHeadline", { value: promo.discountValue })
      : currency
        ? t("amountHeadline", { value: formatMoney(promo.discountValue, currency, locale) })
        : t("amountHeadlineGeneric");

  return (
    <div className="pointer-events-none fixed inset-x-0 top-32 z-[var(--z-dropdown)] flex justify-center px-4 sm:top-18">
      <div
        className={cn(
          "pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-full border border-border bg-surface py-2 pr-4 pl-3 shadow-lg transition-all duration-250 ease-out",
          visible ? "translate-y-0 opacity-100" : "-translate-y-1.5 opacity-0",
        )}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
          <TagIcon className="size-3.5" />
        </span>
        <span className="truncate text-sm font-medium text-text">{headline}</span>
        <span className="hidden shrink-0 text-xs text-text-muted sm:inline">{t("withCode")}</span>
        <span className="shrink-0 rounded-full bg-primary px-2.5 py-0.5 font-mono text-xs font-bold tracking-wide text-text-on-primary">
          {promo.code}
        </span>
        {promo.minOrderAmount > 0 && currency && (
          <span className="hidden shrink-0 text-xs text-text-muted sm:inline">
            {t("minOrderNote", { amount: formatMoney(promo.minOrderAmount, currency, locale) })}
          </span>
        )}
      </div>
    </div>
  );
}
