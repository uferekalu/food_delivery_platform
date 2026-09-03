"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/ui/image-upload";
import { DocumentUpload } from "@/components/ui/document-upload";
import { Alert } from "@/components/ui/alert";
import { STORE_TYPES, type StoreType } from "@/lib/redux/restaurant-types";
import type { StoreInput } from "@/lib/redux/services/stores-api";
import { getLocalizedCountryOptions, getLocalizedCurrencyOptions, currencyForCountry } from "@/lib/countries";

export interface StoreFormProps {
  defaultValues?: Partial<FormInput>;
  defaultLogoUrl?: string | null;
  defaultCoverUrl?: string | null;
  defaultComplianceDocumentUrl?: string | null;
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (input: StoreInput & { logoUrl?: string; coverUrl?: string }) => void;
}

interface FormInput {
  name: string;
  description?: string;
  type: StoreType;
  tagsRaw?: string;
  currency: string;
  country: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode?: string;
  // z.preprocess accepts anything as input (it runs before validation/coercion), so the
  // resolver's inferred input type for these three fields is `unknown`, not `number | string`.
  lat?: unknown;
  lng?: unknown;
  estimatedDeliveryMinutes?: unknown;
}

export function StoreForm({
  defaultValues,
  defaultLogoUrl,
  defaultCoverUrl,
  defaultComplianceDocumentUrl,
  isSubmitting,
  submitLabel,
  onSubmit,
}: StoreFormProps) {
  const t = useTranslations("StoreForm");
  const locale = useLocale();
  const countryOptions = useMemo(() => getLocalizedCountryOptions(locale), [locale]);
  const currencyOptions = useMemo(() => getLocalizedCurrencyOptions(locale), [locale]);
  const TYPE_OPTIONS = useMemo(
    () => STORE_TYPES.map((value) => ({ value, label: t(value === "groceries" ? "groceries" : "pharmacyBeauty") })),
    [t],
  );

  const schema = z.object({
    name: z.string().min(2, t("tooShort")).max(100),
    description: z.string().max(2000).optional(),
    type: z.enum(STORE_TYPES),
    tagsRaw: z.string().optional(),
    currency: z.string().length(3, t("threeLetterCode")),
    country: z.string().min(2).max(100),
    line1: z.string().min(1, t("required")),
    line2: z.string().optional(),
    city: z.string().min(1, t("required")),
    state: z.string().min(1, t("required")),
    postalCode: z.string().optional(),
    lat: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : Number(v)),
      z.number().min(-90, t("mustBeBetweenMinus90And90")).max(90).optional(),
    ),
    lng: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : Number(v)),
      z.number().min(-180, t("mustBeBetweenMinus180And180")).max(180).optional(),
    ),
    estimatedDeliveryMinutes: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : Number(v)),
      z.number().min(0).optional(),
    ),
  });
  type FormValues = z.output<typeof schema>;

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: "groceries", ...defaultValues },
  });

  const [logoUrl, setLogoUrl] = useState<string | undefined>(defaultLogoUrl ?? undefined);
  const [coverUrl, setCoverUrl] = useState<string | undefined>(defaultCoverUrl ?? undefined);
  const [complianceDocumentUrl, setComplianceDocumentUrl] = useState<string | undefined>(
    defaultComplianceDocumentUrl ?? undefined,
  );
  const [complianceError, setComplianceError] = useState<string | null>(null);

  const submit = (values: FormValues) => {
    if (!complianceDocumentUrl) {
      setComplianceError(t("uploadComplianceDocument"));
      return;
    }
    setComplianceError(null);
    onSubmit({
      name: values.name,
      description: values.description,
      type: values.type,
      tags: (values.tagsRaw ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      currency: values.currency.toUpperCase(),
      country: values.country,
      address: {
        line1: values.line1,
        line2: values.line2,
        city: values.city,
        state: values.state,
        postalCode: values.postalCode,
        lat: values.lat,
        lng: values.lng,
      },
      estimatedDeliveryMinutes: values.estimatedDeliveryMinutes,
      complianceDocumentUrl,
      ...(logoUrl ? { logoUrl } : {}),
      ...(coverUrl ? { coverUrl } : {}),
    });
  };

  return (
    <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <ImageUpload label={t("logo")} folder="stores" value={logoUrl} onChange={setLogoUrl} />
        <ImageUpload label={t("coverPhoto")} folder="stores" value={coverUrl} onChange={setCoverUrl} />
      </div>

      {complianceError && <Alert variant="danger">{complianceError}</Alert>}
      <DocumentUpload
        label={t("businessRegistrationDocument")}
        folder="compliance-documents"
        value={complianceDocumentUrl}
        onChange={(url) => {
          setComplianceDocumentUrl(url);
          setComplianceError(null);
        }}
        hint={t("businessRegistrationHint")}
      />

      <FormField label={t("storeName")} error={errors.name?.message} required>
        <Input {...register("name")} />
      </FormField>
      <FormField label={t("description")} error={errors.description?.message}>
        <Textarea {...register("description")} />
      </FormField>
      <FormField label={t("storeType")} error={errors.type?.message} required>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Select options={TYPE_OPTIONS} value={field.value} onChange={field.onChange} />
          )}
        />
      </FormField>
      <FormField label={t("tags")} hint={t("tagsHint")} error={errors.tagsRaw?.message}>
        <Input {...register("tagsRaw")} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={t("country")} error={errors.country?.message} required>
          <Controller
            control={control}
            name="country"
            render={({ field }) => (
              <Select
                options={countryOptions}
                value={field.value}
                onChange={(value) => {
                  field.onChange(value);
                  const suggested = currencyForCountry(value);
                  if (suggested) setValue("currency", suggested, { shouldValidate: true });
                }}
                placeholder={t("selectACountry")}
                searchable
                searchPlaceholder={t("searchCountries")}
              />
            )}
          />
        </FormField>
        <FormField label={t("currency")} hint={t("currencyHint")} error={errors.currency?.message} required>
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <Select
                options={currencyOptions}
                value={field.value}
                onChange={field.onChange}
                placeholder={t("selectACurrency")}
                searchable
                searchPlaceholder={t("searchCurrencies")}
              />
            )}
          />
        </FormField>
      </div>

      <FormField
        label={t("estimatedDeliveryTime")}
        hint={t("estimatedDeliveryTimeHint")}
        error={errors.estimatedDeliveryMinutes?.message}
      >
        <Input type="number" min="0" step="1" {...register("estimatedDeliveryMinutes")} />
      </FormField>

      <FormField label={t("addressLine1")} error={errors.line1?.message} required>
        <Input {...register("line1")} />
      </FormField>
      <FormField label={t("addressLine2")} error={errors.line2?.message}>
        <Input {...register("line2")} />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label={t("city")} error={errors.city?.message} required>
          <Input {...register("city")} />
        </FormField>
        <FormField label={t("state")} error={errors.state?.message} required>
          <Input {...register("state")} />
        </FormField>
        <FormField label={t("postalCode")} error={errors.postalCode?.message}>
          <Input {...register("postalCode")} />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={t("latitude")} hint={t("latitudeHint")} error={errors.lat?.message}>
          <Input type="number" step="any" {...register("lat")} />
        </FormField>
        <FormField label={t("longitude")} error={errors.lng?.message}>
          <Input type="number" step="any" {...register("lng")} />
        </FormField>
      </div>

      <Button type="submit" isLoading={isSubmitting} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
