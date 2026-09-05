"use client";

import { use, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useGetMyStoresQuery } from "@/lib/redux/services/stores-api";
import {
  useGetStoreDeliveryZonesQuery,
  useDeleteStoreDeliveryZoneMutation,
} from "@/lib/redux/services/delivery-zones-api";
import { getErrorMessage } from "@/lib/redux/error";
import { formatMoney } from "@/lib/currency";
import type { DeliveryZone } from "@/lib/redux/restaurant-types";
import { StoreZoneFormModal } from "./zone-form-modal";

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
      <path d="M2 4h12M6 4V2.5A1.5 1.5 0 017.5 1h1A1.5 1.5 0 0110 2.5V4m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4h8z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ZoneRow({
  zone,
  currency,
  storeId,
  onEdit,
}: {
  zone: DeliveryZone;
  currency: string;
  storeId: string;
  onEdit: () => void;
}) {
  const t = useTranslations("DeliveryZonesPage");
  const locale = useLocale();
  const { toast } = useToast();
  const [deleteZone, { isLoading: isDeleting }] = useDeleteStoreDeliveryZoneMutation();
  const [confirming, setConfirming] = useState(false);

  function confirmDelete() {
    void deleteZone({ storeId, zoneId: zone._id })
      .unwrap()
      .then(() => setConfirming(false))
      .catch((err: unknown) => {
        setConfirming(false);
        toast({ title: t("couldNotDeleteZone"), description: getErrorMessage(err), variant: "danger" });
      });
  }

  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text">{zone.name}</span>
          {!zone.isActive && <Badge variant="neutral">{t("inactive")}</Badge>}
        </div>
        <span className="text-sm text-text-muted">{t("upToKm", { km: zone.maxDistanceKm })}</span>
        <span className="text-sm text-text-muted">
          {formatMoney(zone.baseFee, currency, locale)} {t("base")}
          {zone.perKmFee > 0 ? ` + ${formatMoney(zone.perKmFee, currency, locale)}/km` : ""}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <IconButton label={t("editZone")} size="sm" variant="ghost" icon={<EditIcon />} onClick={onEdit} />
        <IconButton
          label={t("deleteZone")}
          size="sm"
          variant="ghost"
          disabled={isDeleting}
          onClick={() => setConfirming(true)}
          icon={<TrashIcon />}
        />
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={confirmDelete}
        title={t("deleteZoneTitle", { name: zone.name })}
        description={t("cannotBeUndone")}
        confirmLabel={t("delete")}
        isLoading={isDeleting}
      />
    </div>
  );
}

function StoreDeliveryZonesManager({ storeId }: { storeId: string }) {
  const t = useTranslations("DeliveryZonesPage");
  const { data: stores, isLoading: loadingStore } = useGetMyStoresQuery();
  const { data: zones, isLoading: loadingZones } = useGetStoreDeliveryZonesQuery(storeId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryZone | null>(null);

  const store = stores?.find((s) => s._id === storeId);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(zone: DeliveryZone) {
    setEditing(zone);
    setModalOpen(true);
  }

  if (loadingStore || loadingZones) return <Skeleton className="h-64 w-full" />;
  if (!store) {
    return <Alert variant="danger">{t("storeNotFound")}</Alert>;
  }

  const hasCoordinates = store.address.lat != null && store.address.lng != null;

  return (
    <div className="flex flex-col gap-4">
      {!hasCoordinates && (
        <Alert variant="warning">
          {t("noCoordinatesWarningStore")}{" "}
          <Link href={`/dashboard/stores/${storeId}`} className="underline">
            {t("storeDetailsPage")}
          </Link>
          . {t("flatFeeUntilThen")}
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">{t("zonesMatchedByDistanceStore")}</p>
        <Button size="sm" onClick={openAdd}>
          {t("addZone")}
        </Button>
      </div>

      {!zones || zones.length === 0 ? (
        <EmptyState title={t("noDeliveryZonesYet")} description={t("fallsBackToFlatFee")} />
      ) : (
        <Card>
          <CardContent>
            {zones.map((zone) => (
              <ZoneRow
                key={zone._id}
                zone={zone}
                currency={store.currency}
                storeId={storeId}
                onEdit={() => openEdit(zone)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <StoreZoneFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        storeId={storeId}
        currency={store.currency}
        editing={editing}
      />
    </div>
  );
}

export default function StoreDeliveryZonesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("DeliveryZonesPage");
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <Container className="max-w-2xl py-10">
        <h1 className="mb-6 text-2xl font-bold text-text">{t("deliveryZones")}</h1>
        <StoreDeliveryZonesManager storeId={id} />
      </Container>
    </RequireRole>
  );
}
