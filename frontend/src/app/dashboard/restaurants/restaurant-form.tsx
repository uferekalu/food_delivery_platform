"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageUpload } from "@/components/ui/image-upload";
import type { OpeningHour } from "@/lib/redux/restaurant-types";
import type { RestaurantInput } from "@/lib/redux/services/restaurants-api";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const schema = z.object({
  name: z.string().min(2, "Too short").max(100),
  description: z.string().max(2000).optional(),
  cuisineTypesRaw: z.string().min(1, "Add at least one, comma-separated"),
  currency: z.string().length(3, "3-letter code, e.g. NGN"),
  country: z.string().min(2).max(100),
  line1: z.string().min(1, "Required"),
  line2: z.string().optional(),
  city: z.string().min(1, "Required"),
  state: z.string().min(1, "Required"),
  postalCode: z.string().optional(),
  lat: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : Number(v)),
    z.number().min(-90, "Must be between -90 and 90").max(90).optional(),
  ),
  lng: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : Number(v)),
    z.number().min(-180, "Must be between -180 and 180").max(180).optional(),
  ),
});
type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

function defaultHours(): OpeningHour[] {
  return DAY_LABELS.map((_, dayOfWeek) => ({
    dayOfWeek,
    openTime: "09:00",
    closeTime: "21:00",
    isClosed: false,
  }));
}

export interface RestaurantFormProps {
  defaultValues?: Partial<FormInput>;
  defaultOpeningHours?: OpeningHour[];
  defaultLogoUrl?: string | null;
  defaultCoverUrl?: string | null;
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (input: RestaurantInput & { logoUrl?: string; coverUrl?: string }) => void;
}

export function RestaurantForm({
  defaultValues,
  defaultOpeningHours,
  defaultLogoUrl,
  defaultCoverUrl,
  isSubmitting,
  submitLabel,
  onSubmit,
}: RestaurantFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues });

  const [hours, setHours] = useState<OpeningHour[]>(
    defaultOpeningHours && defaultOpeningHours.length === 7 ? defaultOpeningHours : defaultHours(),
  );
  const [logoUrl, setLogoUrl] = useState<string | undefined>(defaultLogoUrl ?? undefined);
  const [coverUrl, setCoverUrl] = useState<string | undefined>(defaultCoverUrl ?? undefined);

  function updateHour(index: number, patch: Partial<OpeningHour>) {
    setHours((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  }

  const submit = (values: FormValues) => {
    onSubmit({
      name: values.name,
      description: values.description,
      cuisineTypes: values.cuisineTypesRaw
        .split(",")
        .map((c) => c.trim())
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
      openingHours: hours,
      ...(logoUrl ? { logoUrl } : {}),
      ...(coverUrl ? { coverUrl } : {}),
    });
  };

  return (
    <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <ImageUpload label="Logo" folder="restaurants" value={logoUrl} onChange={setLogoUrl} />
        <ImageUpload label="Cover photo" folder="restaurants" value={coverUrl} onChange={setCoverUrl} />
      </div>

      <FormField label="Restaurant name" error={errors.name?.message} required>
        <Input {...register("name")} />
      </FormField>
      <FormField label="Description" error={errors.description?.message}>
        <Textarea {...register("description")} />
      </FormField>
      <FormField
        label="Cuisine types"
        hint="Comma-separated, e.g. Nigerian, Grill"
        error={errors.cuisineTypesRaw?.message}
        required
      >
        <Input {...register("cuisineTypesRaw")} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Currency" hint="ISO code, e.g. NGN" error={errors.currency?.message} required>
          <Input {...register("currency")} maxLength={3} className="uppercase" />
        </FormField>
        <FormField label="Country" error={errors.country?.message} required>
          <Input {...register("country")} />
        </FormField>
      </div>

      <FormField label="Address line 1" error={errors.line1?.message} required>
        <Input {...register("line1")} />
      </FormField>
      <FormField label="Address line 2" error={errors.line2?.message}>
        <Input {...register("line2")} />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="City" error={errors.city?.message} required>
          <Input {...register("city")} />
        </FormField>
        <FormField label="State" error={errors.state?.message} required>
          <Input {...register("state")} />
        </FormField>
        <FormField label="Postal code" error={errors.postalCode?.message}>
          <Input {...register("postalCode")} />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Latitude"
          hint="Optional — enables real distance-based delivery fees"
          error={errors.lat?.message}
        >
          <Input type="number" step="any" {...register("lat")} />
        </FormField>
        <FormField label="Longitude" error={errors.lng?.message}>
          <Input type="number" step="any" {...register("lng")} />
        </FormField>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text">Opening hours</span>
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {hours.map((hour, index) => (
            <div key={hour.dayOfWeek} className="flex flex-wrap items-center gap-3 p-3">
              <span className="w-24 shrink-0 text-sm text-text">{DAY_LABELS[hour.dayOfWeek]}</span>
              <Checkbox
                label="Closed"
                checked={hour.isClosed}
                onChange={(e) => updateHour(index, { isClosed: e.target.checked })}
              />
              {!hour.isClosed && (
                <>
                  <input
                    type="time"
                    value={hour.openTime}
                    onChange={(e) => updateHour(index, { openTime: e.target.value })}
                    className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    aria-label={`${DAY_LABELS[hour.dayOfWeek]} opening time`}
                  />
                  <span className="text-text-muted">to</span>
                  <input
                    type="time"
                    value={hour.closeTime}
                    onChange={(e) => updateHour(index, { closeTime: e.target.value })}
                    className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    aria-label={`${DAY_LABELS[hour.dayOfWeek]} closing time`}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <Button type="submit" isLoading={isSubmitting} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
