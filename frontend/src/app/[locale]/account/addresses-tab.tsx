"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useListAddressesQuery, useRemoveAddressMutation } from "@/lib/redux/services/account-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { SavedAddress } from "@/lib/redux/restaurant-types";
import { SavedAddressFormModal } from "./saved-address-form-modal";

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path
        d="M11 2l3 3-8 8-3.5 1L3.5 11l8-8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AddressRow({ address, onEdit }: { address: SavedAddress; onEdit: () => void }) {
  const t = useTranslations("AccountPage");
  const { toast } = useToast();
  const [removeAddress, { isLoading: isRemoving }] = useRemoveAddressMutation();
  const [confirming, setConfirming] = useState(false);

  function confirmDelete() {
    void removeAddress(address._id)
      .unwrap()
      .then(() => setConfirming(false))
      .catch((err: unknown) => {
        setConfirming(false);
        toast({ title: t("couldNotDeleteAddress"), description: getErrorMessage(err), variant: "danger" });
      });
  }

  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text">{address.label}</span>
          {address.isDefault && <Badge variant="primary">{t("default")}</Badge>}
        </div>
        <span className="text-sm text-text-muted">
          {address.address.line1}
          {address.address.line2 ? `, ${address.address.line2}` : ""}
        </span>
        <span className="text-sm text-text-muted">
          {address.address.city}, {address.address.state}
          {address.address.postalCode ? ` ${address.address.postalCode}` : ""}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <IconButton label={t("editAddress")} size="sm" variant="ghost" icon={<EditIcon />} onClick={onEdit} />
        <IconButton
          label={t("deleteAddress")}
          size="sm"
          variant="ghost"
          disabled={isRemoving}
          onClick={() => setConfirming(true)}
          icon={<TrashIcon />}
        />
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={confirmDelete}
        title={t("deleteAddressTitle", { label: address.label })}
        description={t("cannotBeUndone")}
        confirmLabel={t("delete")}
        isLoading={isRemoving}
      />
    </div>
  );
}

export function AddressesTab() {
  const t = useTranslations("AccountPage");
  const { data: addresses, isLoading } = useListAddressesQuery();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SavedAddress | null>(null);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(address: SavedAddress) {
    setEditing(address);
    setModalOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">{t("saveAddressesDescription")}</p>
        <Button size="sm" onClick={openAdd}>
          {t("addAddress")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : !addresses || addresses.length === 0 ? (
        <EmptyState title={t("noSavedAddresses")} description={t("addOneToSpeedUpCheckout")} />
      ) : (
        <Card>
          <CardContent>
            {addresses.map((address) => (
              <AddressRow key={address._id} address={address} onEdit={() => openEdit(address)} />
            ))}
          </CardContent>
        </Card>
      )}

      <SavedAddressFormModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} />
    </div>
  );
}
