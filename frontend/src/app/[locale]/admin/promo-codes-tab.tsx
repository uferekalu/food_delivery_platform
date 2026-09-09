"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  useCreatePromoCodeMutation,
  useListPromoCodesQuery,
  useUpdatePromoCodeMutation,
} from "@/lib/redux/services/admin-api";
import { useListRestaurantsQuery } from "@/lib/redux/services/restaurants-api";
import { useListStoresQuery } from "@/lib/redux/services/stores-api";
import { getErrorMessage } from "@/lib/redux/error";
import { formatNumber } from "@/lib/currency";
import { DISCOUNT_TYPES, STORE_TYPES, type AdminPromoCode } from "@/lib/redux/restaurant-types";

// An empty number input submits as "" — coerced to 0 by z.coerce.number() rather than treated
// as "not provided", which would wrongly fail usageLimit's min(1) whenever it's left blank (the
// intended way to mean "unlimited"). Preprocessing blank strings to undefined first makes
// `.optional()` actually take effect.
const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);

const SCOPE_TYPES = ["platform", "restaurant", "store"] as const;
type ScopeType = (typeof SCOPE_TYPES)[number];

function CreatePromoForm() {
  const t = useTranslations("AdminPromoCodesTab");
  const locale = useLocale();
  const { toast } = useToast();
  const [createPromo, { isLoading }] = useCreatePromoCodeMutation();
  const [scopeType, setScopeType] = useState<ScopeType>("platform");
  const [scopeId, setScopeId] = useState("");

  const SCOPE_TYPE_OPTIONS = SCOPE_TYPES.map((value) => ({
    value,
    label:
      value === "platform" ? t("platformWide") : value === "restaurant" ? t("restaurant") : t("store"),
  }));

  // Fetched only once actually needed — same skip-until-open reasoning as
  // AdminMessagesTab's vendor picker (docs/ROADMAP.md FDP-108).
  const { data: restaurants, isLoading: loadingRestaurants } = useListRestaurantsQuery(
    { limit: 100 },
    { skip: scopeType !== "restaurant" },
  );
  // ListStoresParams.type is required (a store's type is a real filter customers browse by) —
  // the picker needs every store regardless of type, so both of the only two types are fetched
  // and merged rather than adding an admin-only "all stores" endpoint just for this.
  const storesSkip = scopeType !== "store";
  const { data: groceryStores, isLoading: loadingGroceryStores } = useListStoresQuery(
    { type: STORE_TYPES[0], limit: 100 },
    { skip: storesSkip },
  );
  const { data: pharmacyStores, isLoading: loadingPharmacyStores } = useListStoresQuery(
    { type: STORE_TYPES[1], limit: 100 },
    { skip: storesSkip },
  );
  const loadingStores = loadingGroceryStores || loadingPharmacyStores;
  const restaurantOptions = useMemo(
    () => (restaurants?.items ?? []).map((r) => ({ value: r._id, label: r.name })),
    [restaurants],
  );
  const storeOptions = useMemo(
    () =>
      [...(groceryStores?.items ?? []), ...(pharmacyStores?.items ?? [])].map((s) => ({
        value: s._id,
        label: s.name,
      })),
    [groceryStores, pharmacyStores],
  );

  const DISCOUNT_TYPE_OPTIONS = DISCOUNT_TYPES.map((value) => ({
    value,
    label: value === "percentage" ? t("percentage") : t("fixedAmount"),
  }));

  const promoSchema = z.object({
    code: z.string().min(3, t("atLeast3Chars")).toUpperCase(),
    discountType: z.enum(DISCOUNT_TYPES),
    discountValue: z.coerce.number().min(0),
    minOrderAmount: z.preprocess(blankToUndefined, z.coerce.number().min(0).optional()),
    usageLimit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional()),
  });
  type PromoInput = z.input<typeof promoSchema>;
  type PromoValues = z.output<typeof promoSchema>;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PromoInput, unknown, PromoValues>({
    resolver: zodResolver(promoSchema),
    defaultValues: { discountType: "percentage" },
  });
  const discountType = useWatch({ control, name: "discountType" });

  function resetScope() {
    setScopeType("platform");
    setScopeId("");
  }

  async function submit(values: PromoValues) {
    if (scopeType !== "platform" && !scopeId) return;
    try {
      await createPromo({
        code: values.code,
        discountType: values.discountType,
        discountValue: values.discountValue,
        ...(scopeType === "restaurant" ? { restaurantId: scopeId } : {}),
        ...(scopeType === "store" ? { storeId: scopeId } : {}),
        ...(values.minOrderAmount ? { minOrderAmount: values.minOrderAmount } : {}),
        ...(values.usageLimit ? { usageLimit: values.usageLimit } : {}),
      }).unwrap();
      reset({ discountType: values.discountType, code: "", discountValue: 0 });
      resetScope();
      toast({ title: t("promoCodeCreated"), variant: "success" });
    } catch (err) {
      toast({ title: t("couldNotCreatePromoCode"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("newPromoCode")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => void handleSubmit(submit)(e)}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          noValidate
        >
          <FormField label={t("code")} error={errors.code?.message} required>
            <Input placeholder="WELCOME10" {...register("code")} />
          </FormField>
          <FormField label={t("type")} required>
            <Controller
              control={control}
              name="discountType"
              render={({ field }) => (
                <Select options={DISCOUNT_TYPE_OPTIONS} value={field.value} onChange={field.onChange} />
              )}
            />
          </FormField>
          <FormField label={t("value")} error={errors.discountValue?.message} required>
            {discountType === "fixed" ? (
              <Controller
                control={control}
                name="discountValue"
                render={({ field }) => (
                  <MoneyInput
                    value={field.value as number | undefined}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    locale={locale}
                  />
                )}
              />
            ) : (
              <Input type="number" step="0.01" min="0" {...register("discountValue")} />
            )}
          </FormField>
          <FormField label={t("minOrderAmount")} hint={t("optional")}>
            <Controller
              control={control}
              name="minOrderAmount"
              render={({ field }) => (
                <MoneyInput
                  value={field.value as number | undefined}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  locale={locale}
                />
              )}
            />
          </FormField>
          <FormField label={t("appliesTo")} required>
            <Select
              options={SCOPE_TYPE_OPTIONS}
              value={scopeType}
              onChange={(v) => {
                setScopeType(v as ScopeType);
                setScopeId("");
              }}
            />
          </FormField>
          {scopeType === "restaurant" && (
            <FormField label={t("restaurant")} required className="sm:col-span-2">
              {loadingRestaurants ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  options={restaurantOptions}
                  value={scopeId}
                  onChange={setScopeId}
                  searchable
                  placeholder={t("selectRestaurant")}
                />
              )}
            </FormField>
          )}
          {scopeType === "store" && (
            <FormField label={t("store")} required className="sm:col-span-2">
              {loadingStores ? (
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
          )}
          <FormField label={t("usageLimit")} hint={t("optionalUnlimited")} className="sm:col-span-2">
            <Input type="number" min="1" {...register("usageLimit")} />
          </FormField>
          <Button
            type="submit"
            isLoading={isLoading}
            disabled={scopeType !== "platform" && !scopeId}
            className="self-end"
          >
            {t("createPromoCode")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PromoRow({ promo }: { promo: AdminPromoCode }) {
  const t = useTranslations("AdminPromoCodesTab");
  const locale = useLocale();
  const { toast } = useToast();
  const [updatePromo, { isLoading }] = useUpdatePromoCodeMutation();

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-text">{promo.code}</span>
            <Badge variant={promo.isActive ? "success" : "neutral"}>{promo.isActive ? t("active") : t("inactive")}</Badge>
            <Badge variant="neutral">
              {promo.scope.type === "platform"
                ? t("platformWide")
                : promo.scope.type === "restaurant"
                  ? t("restaurantScopeLabel", { name: promo.scope.name })
                  : t("storeScopeLabel", { name: promo.scope.name })}
            </Badge>
          </div>
          <span className="text-sm text-text-muted">
            {promo.discountType === "percentage"
              ? t("percentOff", { value: promo.discountValue })
              : t("amountOff", { value: formatNumber(promo.discountValue, locale) })}
            {promo.usageLimit
              ? t("usedOfLimit", { used: promo.usedCount, limit: promo.usageLimit })
              : t("usedTimes", { count: promo.usedCount })}
          </span>
        </div>
        <Switch
          label={t("togglePromo", { code: promo.code })}
          hideLabel
          checked={promo.isActive}
          disabled={isLoading}
          onChange={(checked) =>
            void updatePromo({ id: promo._id, body: { isActive: checked } })
              .unwrap()
              .catch((err: unknown) =>
                toast({ title: t("couldNotUpdatePromoCode"), description: getErrorMessage(err), variant: "danger" }),
              )
          }
        />
      </CardContent>
    </Card>
  );
}

export function PromoCodesTab() {
  const t = useTranslations("AdminPromoCodesTab");
  const { data, isLoading } = useListPromoCodesQuery();

  return (
    <div className="flex flex-col gap-6">
      <CreatePromoForm />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState title={t("noPromoCodesYet")} description={t("createOneAboveDescription")} />
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((promo) => (
            <PromoRow key={promo._id} promo={promo} />
          ))}
        </div>
      )}
    </div>
  );
}
