"use client";

import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import {
  useCreateDeliveryZoneMutation,
  useUpdateDeliveryZoneMutation,
} from "@/lib/redux/services/delivery-zones-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { DeliveryZone } from "@/lib/redux/restaurant-types";

export interface ZoneFormModalProps {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  /** Present when editing an existing zone; omitted when adding a new one. */
  editing?: DeliveryZone | null;
}

export function ZoneFormModal({ open, onClose, restaurantId, editing }: ZoneFormModalProps) {
  const t = useTranslations("DeliveryZonesPage");
  const schema = z.object({
    name: z.string().min(1, t("required")).max(100),
    maxDistanceKm: z.coerce.number().min(0, t("mustBe0OrMore")).max(1000),
    baseFee: z.coerce.number().min(0, t("mustBe0OrMore")),
    perKmFee: z.coerce.number().min(0, t("mustBe0OrMore")).optional(),
  });
  type FormInput = z.input<typeof schema>;
  type FormValues = z.output<typeof schema>;
  const { toast } = useToast();
  const [createZone, { isLoading: isCreating }] = useCreateDeliveryZoneMutation();
  const [updateZone, { isLoading: isUpdating }] = useUpdateDeliveryZoneMutation();
  const isSubmitting = isCreating || isUpdating;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    values: editing
      ? {
          name: editing.name,
          maxDistanceKm: editing.maxDistanceKm,
          baseFee: editing.baseFee,
          perKmFee: editing.perKmFee,
        }
      : { name: "", maxDistanceKm: 5, baseFee: 0, perKmFee: 0 },
  });

  async function submit(values: FormValues) {
    try {
      if (editing) {
        await updateZone({ restaurantId, zoneId: editing._id, body: values }).unwrap();
        toast({ title: t("zoneUpdated"), variant: "success" });
      } else {
        await createZone({ restaurantId, body: values }).unwrap();
        toast({ title: t("zoneAdded"), variant: "success" });
      }
      onClose();
    } catch (err) {
      toast({ title: t("couldNotSaveZone"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? t("editDeliveryZone") : t("addDeliveryZone")} size="md">
      <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-4" noValidate>
        <FormField label={t("zoneName")} hint={t("zoneNameHint")} error={errors.name?.message} required>
          <Input {...register("name")} />
        </FormField>
        <FormField
          label={t("upToKmLabel")}
          hint={t("upToKmHint")}
          error={errors.maxDistanceKm?.message}
          required
        >
          <Input type="number" step="any" {...register("maxDistanceKm")} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("baseFee")} error={errors.baseFee?.message} required>
            <Input type="number" step="any" {...register("baseFee")} />
          </FormField>
          <FormField label={t("feePerKm")} error={errors.perKmFee?.message}>
            <Input type="number" step="any" {...register("perKmFee")} />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {editing ? t("saveChanges") : t("addZone")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
