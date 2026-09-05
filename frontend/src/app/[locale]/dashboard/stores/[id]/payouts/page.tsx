"use client";

import { use, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useGetMyStoresQuery } from "@/lib/redux/services/stores-api";
import { useListStorePayoutsQuery } from "@/lib/redux/services/payouts-api";
import type { PayoutStatus } from "@/lib/redux/services/payouts-api";
import { formatMoney } from "@/lib/currency";

const PAYOUT_STATUS_BADGE_VARIANT: Record<PayoutStatus, BadgeProps["variant"]> = {
  pending: "neutral",
  processing: "info",
  succeeded: "success",
  failed: "danger",
};

/**
 * Store payout history (docs/ROADMAP.md FDP-93) — a store's own `Payout` audit trail, mirroring
 * the restaurant Earnings page's history section. Deliberately just the history, not a full
 * revenue/commission breakdown like restaurants get (`OrdersService.getEarningsSummary` has no
 * store equivalent yet — a separate, pre-existing gap, not something this ticket adds), and no
 * payout-account onboarding here yet either — stores have no onboarding endpoints until FDP-94.
 */
function StorePayoutHistory({ storeId }: { storeId: string }) {
  const t = useTranslations("StorePayoutsPage");
  const tStatus = useTranslations("PayoutStatus");
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListStorePayoutsQuery({ storeId, page, limit: 10 });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="info">{t("onboardingNotAvailableYet")}</Alert>

      {!data || data.items.length === 0 ? (
        <EmptyState title={t("noPayoutsYet")} description={t("payoutsAppearHere")} />
      ) : (
        <>
          <Card>
            <CardContent>
              {data.items.map((payout) => (
                <div
                  key={payout._id}
                  className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-text">
                      {new Date(payout.createdAt).toLocaleDateString(locale)}
                    </span>
                    <span className="text-xs text-text-muted">{payout.provider}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-text">
                      {formatMoney(payout.grossAmount, payout.currency, locale)}
                    </span>
                    <Badge variant={PAYOUT_STATUS_BADGE_VARIANT[payout.status]}>
                      {tStatus(payout.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          {data.totalPages > 1 && (
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}

function StorePayoutsManager({ storeId }: { storeId: string }) {
  const t = useTranslations("StorePayoutsPage");
  const { data: stores, isLoading } = useGetMyStoresQuery();
  const store = stores?.find((s) => s._id === storeId);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!store) return <Alert variant="danger">{t("storeNotFound")}</Alert>;

  return <StorePayoutHistory storeId={storeId} />;
}

export default function StorePayoutsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("StorePayoutsPage");
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <Container className="max-w-2xl py-10">
        <h1 className="mb-6 text-2xl font-bold text-text">{t("payouts")}</h1>
        <StorePayoutsManager storeId={id} />
      </Container>
    </RequireRole>
  );
}
