"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { useAddAddressMutation, useUpdateAddressMutation } from "@/lib/redux/services/account-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { SavedAddress } from "@/lib/redux/restaurant-types";

const schema = z.object({
  label: z.string().min(1, "Required").max(50),
  line1: z.string().min(1, "Required").max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1, "Required").max(100),
  state: z.string().min(1, "Required").max(100),
  postalCode: z.string().max(20).optional(),
  isDefault: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export interface SavedAddressFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Present when editing an existing address; omitted when adding a new one. */
  editing?: SavedAddress | null;
}

export function SavedAddressFormModal({ open, onClose, editing }: SavedAddressFormModalProps) {
  const { toast } = useToast();
  const [addAddress, { isLoading: isAdding }] = useAddAddressMutation();
  const [updateAddress, { isLoading: isUpdating }] = useUpdateAddressMutation();
  const isSubmitting = isAdding || isUpdating;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: editing
      ? {
          label: editing.label,
          line1: editing.address.line1,
          line2: editing.address.line2,
          city: editing.address.city,
          state: editing.address.state,
          postalCode: editing.address.postalCode,
          isDefault: editing.isDefault,
        }
      : { label: "", line1: "", city: "", state: "", isDefault: false },
  });

  async function submit(values: FormValues) {
    const body = {
      label: values.label,
      address: {
        line1: values.line1,
        line2: values.line2?.trim() || undefined,
        city: values.city,
        state: values.state,
        postalCode: values.postalCode?.trim() || undefined,
      },
      isDefault: values.isDefault,
    };

    try {
      if (editing) {
        await updateAddress({ addressId: editing._id, body }).unwrap();
        toast({ title: "Address updated", variant: "success" });
      } else {
        await addAddress(body).unwrap();
        toast({ title: "Address added", variant: "success" });
      }
      onClose();
    } catch (err) {
      toast({ title: "Couldn't save address", description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit address" : "Add address"} size="md">
      <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-4" noValidate>
        {errors.root && <Alert variant="danger">{errors.root.message}</Alert>}
        <FormField label="Label" hint="E.g. Home, Work" error={errors.label?.message} required>
          <Input {...register("label")} />
        </FormField>
        <FormField label="Address line 1" error={errors.line1?.message} required>
          <Input {...register("line1")} />
        </FormField>
        <FormField label="Address line 2" error={errors.line2?.message}>
          <Input {...register("line2")} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
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
        <Checkbox label="Set as default address" {...register("isDefault")} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {editing ? "Save changes" : "Add address"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
