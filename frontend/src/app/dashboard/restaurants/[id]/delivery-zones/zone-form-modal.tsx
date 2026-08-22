"use client";

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

const schema = z.object({
  name: z.string().min(1, "Required").max(100),
  maxDistanceKm: z.coerce.number().min(0, "Must be 0 or more").max(1000),
  baseFee: z.coerce.number().min(0, "Must be 0 or more"),
  perKmFee: z.coerce.number().min(0, "Must be 0 or more").optional(),
});
type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export interface ZoneFormModalProps {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  /** Present when editing an existing zone; omitted when adding a new one. */
  editing?: DeliveryZone | null;
}

export function ZoneFormModal({ open, onClose, restaurantId, editing }: ZoneFormModalProps) {
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
        toast({ title: "Zone updated", variant: "success" });
      } else {
        await createZone({ restaurantId, body: values }).unwrap();
        toast({ title: "Zone added", variant: "success" });
      }
      onClose();
    } catch (err) {
      toast({ title: "Couldn't save zone", description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit delivery zone" : "Add delivery zone"} size="md">
      <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-4" noValidate>
        <FormField label="Zone name" hint="E.g. Nearby (0-3km)" error={errors.name?.message} required>
          <Input {...register("name")} />
        </FormField>
        <FormField
          label="Up to (km)"
          hint="Zones are matched by the nearest covering distance — set up as rings, e.g. 3, 8, 15"
          error={errors.maxDistanceKm?.message}
          required
        >
          <Input type="number" step="any" {...register("maxDistanceKm")} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Base fee" error={errors.baseFee?.message} required>
            <Input type="number" step="any" {...register("baseFee")} />
          </FormField>
          <FormField label="Fee per km" error={errors.perKmFee?.message}>
            <Input type="number" step="any" {...register("perKmFee")} />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {editing ? "Save changes" : "Add zone"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
