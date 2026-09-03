import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Store } from "@/lib/redux/restaurant-types";
import { describeOpenStatus, getOpenStatus } from "@/lib/opening-hours";

export function BasketIcon({ className = "size-12" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className={className}>
      <path d="M9 18h30l-3 21H12L9 18z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M16.5 18v-4.5A7.5 7.5 0 0124 6a7.5 7.5 0 017.5 7.5V18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PillIcon({ className = "size-12" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className={className}>
      <rect x="9" y="19.5" width="30" height="13.5" rx="6.75" stroke="currentColor" strokeWidth="1.5" transform="rotate(-30 24 26.25)" />
      <path d="M24 18.5l4.5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function StoreCard({ store }: { store: Store }) {
  const t = useTranslations("StoreCard");
  const locale = useLocale();
  const icon = store.type === "groceries" ? <BasketIcon className="size-10" /> : <PillIcon className="size-10" />;
  const scheduleStatus = getOpenStatus(store.openingHours, store.country);
  const { label: openLabel, isOpenNow } = describeOpenStatus(store.isOpen, scheduleStatus, locale, t);

  return (
    <Card className="relative h-full overflow-hidden transition-colors duration-150 hover:border-border-strong">
      <Link href={`/stores/${store.slug}`} className="block h-full">
        <div className="relative h-36 w-full bg-secondary">
          {store.coverUrl ? (
            // A store card photo doesn't warrant next/image's layout machinery here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-muted">{icon}</div>
          )}
          {store.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.logoUrl}
              alt=""
              className="absolute -bottom-5 left-4 size-12 rounded-full border-2 border-surface object-cover shadow-sm"
            />
          )}
        </div>
        <CardHeader className={store.logoUrl ? "pt-8" : undefined}>
          <CardTitle>{store.name}</CardTitle>
          <CardDescription>
            ⭐ {store.avgRating.toFixed(1)}
            {store.estimatedDeliveryMinutes
              ? ` • ${t("estimatedMinutes", { minutes: store.estimatedDeliveryMinutes })}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant={isOpenNow ? "success" : "neutral"}>{openLabel}</Badge>
          {store.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="primary">
              {tag}
            </Badge>
          ))}
        </CardContent>
      </Link>
    </Card>
  );
}
