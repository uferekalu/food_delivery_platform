"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  useListAllPayoutsQuery,
  useRunWeeklyPayoutBatchMutation,
  useResolvePayoutReconciliationMutation,
  PAYOUT_STATUSES,
  PAYOUT_VENDOR_TYPES,
} from "@/lib/redux/services/payouts-api";
import type { Payout, PayoutStatus, PayoutVendorType } from "@/lib/redux/services/payouts-api";
import { getErrorMessage } from "@/lib/redux/error";
import { formatMoney } from "@/lib/currency";

const STATUS_BADGE_VARIANT: Record<PayoutStatus, BadgeProps["variant"]> = {
  pending: "neutral",
  processing: "info",
  succeeded: "success",
  failed: "danger",
};

function ResolveReconciliationModal({
  payout,
  open,
  onClose,
}: {
  payout: Payout | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("AdminPayoutsTab");
  const locale = useLocale();
  const { toast } = useToast();
  const [resolve, { isLoading }] = useResolvePayoutReconciliationMutation();

  async function handleResolve(transferActuallySucceeded: boolean) {
    if (!payout) return;
    try {
      await resolve({ id: payout._id, transferActuallySucceeded }).unwrap();
      toast({ title: t("reconciliationResolved"), variant: "success" });
      onClose();
    } catch (err) {
      toast({ title: t("couldNotResolve"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  if (!payout) return null;

  return (
    <Modal open={open} onClose={onClose} title={t("resolveReconciliationTitle")}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          {t("resolveReconciliationDescription", {
            amount: formatMoney(payout.grossAmount, payout.currency, locale),
            provider: payout.provider,
          })}
        </p>
        <Alert variant="warning">{t("checkProviderDashboardFirst", { provider: payout.provider })}</Alert>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1"
            isLoading={isLoading}
            onClick={() => void handleResolve(false)}
          >
            {t("transferDidNotHappen")}
          </Button>
          <Button className="flex-1" isLoading={isLoading} onClick={() => void handleResolve(true)}>
            {t("transferDidHappen")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PayoutRow({ payout, onResolve }: { payout: Payout; onResolve: (p: Payout) => void }) {
  const t = useTranslations("AdminPayoutsTab");
  const tStatus = useTranslations("PayoutStatus");
  const locale = useLocale();

  return (
    <div className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-text">
          {t("vendorLine", { vendorType: payout.vendorType, vendorId: payout.vendorId })}
        </span>
        <span className="text-xs text-text-muted">
          {new Date(payout.createdAt).toLocaleString(locale)} · {payout.provider}
        </span>
        {payout.failureReason && (
          <span className="text-xs text-danger">{payout.failureReason}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-text">
          {formatMoney(payout.grossAmount, payout.currency, locale)}
        </span>
        <Badge variant={STATUS_BADGE_VARIANT[payout.status]}>{tStatus(payout.status)}</Badge>
        {payout.reconciliationRequired && (
          <Button size="sm" variant="destructive" onClick={() => onResolve(payout)}>
            {t("resolve")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function PayoutsTab() {
  const t = useTranslations("AdminPayoutsTab");
  const tStatus = useTranslations("PayoutStatus");
  const { toast } = useToast();
  const [status, setStatus] = useState<PayoutStatus | "">("");
  const [vendorType, setVendorType] = useState<PayoutVendorType | "">("");
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<Payout | null>(null);
  const [runBatch, { isLoading: running }] = useRunWeeklyPayoutBatchMutation();

  const { data, isLoading, isFetching } = useListAllPayoutsQuery({
    status: status || undefined,
    vendorType: vendorType || undefined,
    reconciliationRequired: needsReconciliation || undefined,
    page,
    limit: 20,
  });

  function resetAndSet<T>(setter: (v: T) => void) {
    return (v: T) => {
      setPage(1);
      setter(v);
    };
  }

  async function handleRunBatch() {
    try {
      const summary = await runBatch().unwrap();
      toast({
        title: t("batchComplete"),
        description: t("batchSummary", {
          succeeded: summary.succeeded,
          failed: summary.failed,
          reconciliationNeeded: summary.reconciliationNeeded,
          skipped: summary.skipped,
        }),
        variant: "success",
      });
    } catch (err) {
      toast({ title: t("couldNotRunBatch"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  const statusOptions = [
    { value: "", label: t("allStatuses") },
    ...PAYOUT_STATUSES.map((s) => ({ value: s, label: tStatus(s) })),
  ];
  const vendorTypeOptions = [
    { value: "", label: t("allVendorTypes") },
    ...PAYOUT_VENDOR_TYPES.map((v) => ({ value: v, label: t(`vendorType_${v}`) })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("weeklyBatch")}</CardTitle>
          <CardDescription>{t("weeklyBatchDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button isLoading={running} onClick={() => void handleRunBatch()}>
            {t("runBatchNow")}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          options={statusOptions}
          value={status}
          onChange={(v) => resetAndSet<PayoutStatus | "">(setStatus)(v as PayoutStatus | "")}
          className="w-full sm:w-48"
          aria-label={t("filterByStatus")}
        />
        <Select
          options={vendorTypeOptions}
          value={vendorType}
          onChange={(v) => resetAndSet<PayoutVendorType | "">(setVendorType)(v as PayoutVendorType | "")}
          className="w-full sm:w-48"
          aria-label={t("filterByVendorType")}
        />
        <Button
          variant={needsReconciliation ? "primary" : "outline"}
          onClick={() => resetAndSet<boolean>(setNeedsReconciliation)(!needsReconciliation)}
        >
          {t("needsReconciliationOnly")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title={t("noPayoutsFound")} description={t("tryDifferentFilters")} />
      ) : (
        <>
          <Card>
            <CardContent className={isFetching ? "opacity-60" : undefined}>
              {data.items.map((payout) => (
                <PayoutRow key={payout._id} payout={payout} onResolve={setResolving} />
              ))}
            </CardContent>
          </Card>
          {data.totalPages > 1 && (
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          )}
        </>
      )}

      <ResolveReconciliationModal
        payout={resolving}
        open={resolving !== null}
        onClose={() => setResolving(null)}
      />
    </div>
  );
}
