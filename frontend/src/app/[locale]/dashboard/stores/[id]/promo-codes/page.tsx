"use client";

import { use } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  useListMyPromoCodesQuery,
  useCreatePromoCodeMutation,
  useUpdatePromoCodeMutation,
} from "@/lib/redux/services/admin-api";
import { useGetMyStoresQuery } from "@/lib/redux/services/stores-api";
import { getErrorMessage } from "@/lib/redux/error";
import { formatNumber } from "@/lib/currency";
import { DISCOUNT_TYPES, type PromoCode } from "@/lib/redux/restaurant-types";

const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);

function CreatePromoForm({ storeId }: { storeId: string }) {
  const t = useTranslations("VendorPromoCodesPage");
  const locale = useLocale();
  const { toast } = useToast();
  const [createPromo, { isLoading }] = useCreatePromoCodeMutation();

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

  async function submit(values: PromoValues) {
    try {
      await createPromo({
        code: values.code,
        discountType: values.discountType,
        discountValue: values.discountValue,
        storeId,
        ...(values.minOrderAmount ? { minOrderAmount: values.minOrderAmount } : {}),
        ...(values.usageLimit ? { usageLimit: values.usageLimit } : {}),
      }).unwrap();
      reset({ discountType: values.discountType, code: "", discountValue: 0 });
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
          <FormField label={t("usageLimit")} hint={t("optionalUnlimited")} className="sm:col-span-2">
            <Input type="number" min="1" {...register("usageLimit")} />
          </FormField>
          <Button type="submit" isLoading={isLoading} className="self-end">
            {t("createPromoCode")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PromoRow({ promo }: { promo: PromoCode }) {
  const t = useTranslations("VendorPromoCodesPage");
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

function PromoCodesManager({ storeId }: { storeId: string }) {
  const t = useTranslations("VendorPromoCodesPage");
  const { data: stores, isLoading: loadingStore } = useGetMyStoresQuery();
  const { data: allMine, isLoading: loadingPromos } = useListMyPromoCodesQuery();
  const store = stores?.find((s) => s._id === storeId);
  const promos = allMine?.filter((p) => p.storeId === storeId) ?? [];

  if (loadingStore || loadingPromos) return <Skeleton className="h-64 w-full" />;
  if (!store) return <Alert variant="danger">{t("storeNotFound")}</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-text-muted">{t("description")}</p>
      <CreatePromoForm storeId={storeId} />

      {promos.length === 0 ? (
        <EmptyState title={t("noPromoCodesYet")} description={t("createOneAboveDescription")} />
      ) : (
        <div className="flex flex-col gap-3">
          {promos.map((promo) => (
            <PromoRow key={promo._id} promo={promo} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function StorePromoCodesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("VendorPromoCodesPage");
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <Container className="max-w-3xl py-10">
        <h1 className="mb-6 text-2xl font-bold text-text">{t("promoCodes")}</h1>
        <PromoCodesManager storeId={id} />
      </Container>
    </RequireRole>
  );
}
