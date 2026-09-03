"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { getErrorMessage } from "@/lib/redux/error";
import { DISCOUNT_TYPES, type PromoCode } from "@/lib/redux/restaurant-types";

const DISCOUNT_TYPE_OPTIONS = DISCOUNT_TYPES.map((value) => ({
  value,
  label: value === "percentage" ? "Percentage" : "Fixed amount",
}));

// An empty number input submits as "" — coerced to 0 by z.coerce.number() rather than treated
// as "not provided", which would wrongly fail usageLimit's min(1) whenever it's left blank (the
// intended way to mean "unlimited"). Preprocessing blank strings to undefined first makes
// `.optional()` actually take effect.
const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);

const promoSchema = z.object({
  code: z.string().min(3, "At least 3 characters").toUpperCase(),
  discountType: z.enum(DISCOUNT_TYPES),
  discountValue: z.coerce.number().min(0),
  minOrderAmount: z.preprocess(blankToUndefined, z.coerce.number().min(0).optional()),
  usageLimit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional()),
});
type PromoInput = z.input<typeof promoSchema>;
type PromoValues = z.output<typeof promoSchema>;

function CreatePromoForm() {
  const { toast } = useToast();
  const [createPromo, { isLoading }] = useCreatePromoCodeMutation();
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

  async function submit(values: PromoValues) {
    try {
      await createPromo({
        code: values.code,
        discountType: values.discountType,
        discountValue: values.discountValue,
        ...(values.minOrderAmount ? { minOrderAmount: values.minOrderAmount } : {}),
        ...(values.usageLimit ? { usageLimit: values.usageLimit } : {}),
      }).unwrap();
      reset({ discountType: values.discountType, code: "", discountValue: 0 });
      toast({ title: "Promo code created", variant: "success" });
    } catch (err) {
      toast({ title: "Couldn't create promo code", description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New promo code</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => void handleSubmit(submit)(e)}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          noValidate
        >
          <FormField label="Code" error={errors.code?.message} required>
            <Input placeholder="WELCOME10" {...register("code")} />
          </FormField>
          <FormField label="Type" required>
            <Controller
              control={control}
              name="discountType"
              render={({ field }) => (
                <Select options={DISCOUNT_TYPE_OPTIONS} value={field.value} onChange={field.onChange} />
              )}
            />
          </FormField>
          <FormField label="Value" error={errors.discountValue?.message} required>
            <Input type="number" step="0.01" min="0" {...register("discountValue")} />
          </FormField>
          <FormField label="Min order amount" hint="Optional">
            <Input type="number" step="0.01" min="0" {...register("minOrderAmount")} />
          </FormField>
          <FormField label="Usage limit" hint="Optional — blank = unlimited" className="sm:col-span-2">
            <Input type="number" min="1" {...register("usageLimit")} />
          </FormField>
          <Button type="submit" isLoading={isLoading} className="self-end">
            Create promo code
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PromoRow({ promo }: { promo: PromoCode }) {
  const { toast } = useToast();
  const [updatePromo, { isLoading }] = useUpdatePromoCodeMutation();

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-text">{promo.code}</span>
            <Badge variant={promo.isActive ? "success" : "neutral"}>{promo.isActive ? "Active" : "Inactive"}</Badge>
          </div>
          <span className="text-sm text-text-muted">
            {promo.discountType === "percentage" ? `${promo.discountValue}% off` : `${promo.discountValue} off`}
            {promo.usageLimit ? ` · used ${promo.usedCount}/${promo.usageLimit}` : ` · used ${promo.usedCount} time(s)`}
          </span>
        </div>
        <Switch
          label={`Toggle ${promo.code}`}
          hideLabel
          checked={promo.isActive}
          disabled={isLoading}
          onChange={(checked) =>
            void updatePromo({ id: promo._id, body: { isActive: checked } })
              .unwrap()
              .catch((err: unknown) =>
                toast({ title: "Couldn't update promo code", description: getErrorMessage(err), variant: "danger" }),
              )
          }
        />
      </CardContent>
    </Card>
  );
}

export function PromoCodesTab() {
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
        <EmptyState title="No promo codes yet" description="Create one above to offer a discount." />
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
