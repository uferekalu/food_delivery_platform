"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  useCancelAdCampaignMutation,
  useCreateAdCampaignMutation,
  useListAdCampaignsQuery,
  useMarkAdCampaignPaidManuallyMutation,
} from "@/lib/redux/services/ad-campaigns-api";
import { useListAllRestaurantsForAdminQuery } from "@/lib/redux/services/restaurants-api";
import { useListAllStoresForAdminQuery } from "@/lib/redux/services/stores-api";
import { getErrorMessage } from "@/lib/redux/error";
import { formatMoney } from "@/lib/currency";
import type { AdCampaignStatus, AdminAdCampaign } from "@/lib/redux/restaurant-types";

const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);

const SCOPE_TYPES = ["restaurant", "store"] as const;
type ScopeType = (typeof SCOPE_TYPES)[number];

const DURATION_PRESETS = [7, 14, 30] as const;

const STATUS_BADGE_VARIANT: Record<AdCampaignStatus, "warning" | "info" | "success" | "neutral" | "danger"> = {
  pending_payment: "warning",
  scheduled: "info",
  active: "success",
  ended: "neutral",
  cancelled: "danger",
};

function TagIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4 shrink-0">
      <path
        d="M10.5 3H4a1 1 0 0 0-1 1v6.5a1 1 0 0 0 .29.71l7.5 7.5a1 1 0 0 0 1.42 0l6.5-6.5a1 1 0 0 0 0-1.42l-7.5-7.5A1 1 0 0 0 10.5 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="7" r="1.25" fill="currentColor" />
    </svg>
  );
}

function CreateCampaignForm() {
  const t = useTranslations("AdminAdCampaignsTab");
  const locale = useLocale();
  const { toast } = useToast();
  const [createCampaign, { isLoading }] = useCreateAdCampaignMutation();
  const [scopeType, setScopeType] = useState<ScopeType>("restaurant");
  const [scopeId, setScopeId] = useState("");
  const [duration, setDuration] = useState<number>(7);
  const [customDuration, setCustomDuration] = useState(false);

  const SCOPE_TYPE_OPTIONS = SCOPE_TYPES.map((value) => ({
    value,
    label: value === "restaurant" ? t("restaurant") : t("store"),
  }));

  const { data: restaurants, isLoading: loadingRestaurants } = useListAllRestaurantsForAdminQuery(undefined, {
    skip: scopeType !== "restaurant",
  });
  const { data: stores, isLoading: loadingStores } = useListAllStoresForAdminQuery(undefined, {
    skip: scopeType !== "store",
  });
  const restaurantOptions = useMemo(
    () => (restaurants ?? []).map((r) => ({ value: r._id, label: r.name })),
    [restaurants],
  );
  const storeOptions = useMemo(() => (stores ?? []).map((s) => ({ value: s._id, label: s.name })), [stores]);

  const selectedVendorCurrency = useMemo(() => {
    if (!scopeId) return null;
    if (scopeType === "restaurant") return restaurants?.find((r) => r._id === scopeId)?.currency ?? null;
    return stores?.find((s) => s._id === scopeId)?.currency ?? null;
  }, [scopeType, scopeId, restaurants, stores]);

  const campaignSchema = z.object({
    startDate: z.string().min(1, t("required")),
    totalPriceOverride: z.preprocess(blankToUndefined, z.coerce.number().min(0).optional()),
    adminNotes: z.string().max(500).optional(),
  });
  type CampaignInput = z.input<typeof campaignSchema>;
  type CampaignValues = z.output<typeof campaignSchema>;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CampaignInput, unknown, CampaignValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { startDate: new Date().toISOString().slice(0, 10) },
  });

  function resetScope() {
    setScopeId("");
    setDuration(7);
    setCustomDuration(false);
  }

  async function submit(values: CampaignValues) {
    if (!scopeId) return;
    try {
      await createCampaign({
        ...(scopeType === "restaurant" ? { restaurantId: scopeId } : { storeId: scopeId }),
        startDate: values.startDate,
        durationDays: duration,
        ...(values.totalPriceOverride ? { totalPriceOverride: values.totalPriceOverride } : {}),
        ...(values.adminNotes ? { adminNotes: values.adminNotes } : {}),
      }).unwrap();
      reset({ startDate: new Date().toISOString().slice(0, 10) });
      resetScope();
      toast({ title: t("campaignCreated"), variant: "success" });
    } catch (err) {
      toast({ title: t("couldNotCreateCampaign"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="bg-primary-subtle/30">
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-text-on-primary">
            <TagIcon />
          </span>
          {t("newCampaign")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-5" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t("advertise")} required>
              <Select
                options={SCOPE_TYPE_OPTIONS}
                value={scopeType}
                onChange={(v) => {
                  setScopeType(v as ScopeType);
                  setScopeId("");
                }}
              />
            </FormField>
            <FormField label={scopeType === "restaurant" ? t("restaurant") : t("store")} required>
              {scopeType === "restaurant" ? (
                loadingRestaurants ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    options={restaurantOptions}
                    value={scopeId}
                    onChange={setScopeId}
                    searchable
                    placeholder={t("selectRestaurant")}
                  />
                )
              ) : loadingStores ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  options={storeOptions}
                  value={scopeId}
                  onChange={setScopeId}
                  searchable
                  placeholder={t("selectStore")}
                />
              )}
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t("startDate")} error={errors.startDate?.message} required>
              <Input type="date" {...register("startDate")} />
            </FormField>
            <FormField label={t("duration")} required>
              <div className="flex flex-wrap items-center gap-2">
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setDuration(preset);
                      setCustomDuration(false);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                      !customDuration && duration === preset
                        ? "border-primary bg-primary text-text-on-primary"
                        : "border-border-strong bg-surface text-text hover:border-primary"
                    }`}
                  >
                    {t("daysCount", { count: preset })}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCustomDuration(true)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                    customDuration
                      ? "border-primary bg-primary text-text-on-primary"
                      : "border-border-strong bg-surface text-text hover:border-primary"
                  }`}
                >
                  {t("custom")}
                </button>
                {customDuration && (
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={duration}
                    onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 1))}
                    className="w-24"
                  />
                )}
              </div>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label={t("overrideTotal")}
              hint={selectedVendorCurrency ? t("overridePriceHint", { currency: selectedVendorCurrency }) : t("overridePriceHintNoVendor")}
            >
              <Controller
                control={control}
                name="totalPriceOverride"
                render={({ field }) => (
                  <MoneyInput
                    value={field.value as number | undefined}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    currencyCode={selectedVendorCurrency ?? undefined}
                    locale={locale}
                  />
                )}
              />
            </FormField>
            <FormField label={t("notes")} hint={t("optional")}>
              <Input placeholder={t("notesPlaceholder")} {...register("adminNotes")} />
            </FormField>
          </div>

          <Button type="submit" isLoading={isLoading} disabled={!scopeId} className="self-start">
            {t("createCampaign")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CampaignRow({ campaign }: { campaign: AdminAdCampaign }) {
  const t = useTranslations("AdminAdCampaignsTab");
  const locale = useLocale();
  const { toast } = useToast();
  const [cancelCampaign, { isLoading: isCancelling }] = useCancelAdCampaignMutation();
  const [markPaid, { isLoading: isMarkingPaid }] = useMarkAdCampaignPaidManuallyMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canCancel = campaign.status === "pending_payment" || campaign.status === "scheduled";
  const canMarkPaid = campaign.status === "pending_payment";

  async function confirmCancel() {
    try {
      await cancelCampaign({ id: campaign._id }).unwrap();
      toast({ title: t("campaignCancelled"), variant: "success" });
    } catch (err) {
      toast({ title: t("couldNotCancelCampaign"), description: getErrorMessage(err), variant: "danger" });
    } finally {
      setConfirmOpen(false);
    }
  }

  async function handleMarkPaid() {
    try {
      await markPaid(campaign._id).unwrap();
      toast({ title: t("markedPaid"), variant: "success" });
    } catch (err) {
      toast({ title: t("couldNotMarkPaid"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <Card className={campaign.status === "active" ? "border-success/40" : undefined}>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-text">{campaign.vendor.name}</span>
            <Badge variant="neutral">{campaign.vendor.type === "restaurant" ? t("restaurant") : t("store")}</Badge>
            <Badge variant={STATUS_BADGE_VARIANT[campaign.status]}>{t(`status_${campaign.status}`)}</Badge>
            {campaign.paymentStatus === "failed" && <Badge variant="danger">{t("paymentFailed")}</Badge>}
            {campaign.markedPaidManually && <Badge variant="neutral">{t("paidManually")}</Badge>}
          </div>
          <span className="text-sm text-text-muted">
            {t("dateRange", {
              start: new Date(campaign.startDate).toLocaleDateString(locale),
              end: new Date(campaign.endDate).toLocaleDateString(locale),
            })}
            {" · "}
            {formatMoney(campaign.totalPrice, campaign.currency, locale)}
            {campaign.priceOverridden ? ` (${t("overridden")})` : ""}
          </span>
          {campaign.cancelReason && (
            <span className="text-xs text-text-muted">{t("cancelReasonLabel", { reason: campaign.cancelReason })}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canMarkPaid && (
            <Button variant="secondary" size="sm" isLoading={isMarkingPaid} onClick={() => void handleMarkPaid()}>
              {t("markPaid")}
            </Button>
          )}
          {canCancel && (
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
              {t("cancel")}
            </Button>
          )}
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void confirmCancel()}
        title={t("cancelConfirmTitle")}
        description={t("cancelConfirmDescription", { name: campaign.vendor.name })}
        isLoading={isCancelling}
      />
    </Card>
  );
}

export function AdCampaignsTab() {
  const t = useTranslations("AdminAdCampaignsTab");
  const { data, isLoading } = useListAdCampaignsQuery();

  return (
    <div className="flex flex-col gap-6">
      <CreateCampaignForm />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState title={t("noCampaignsYet")} description={t("createOneAboveDescription")} />
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((campaign) => (
            <CampaignRow key={campaign._id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  );
}
