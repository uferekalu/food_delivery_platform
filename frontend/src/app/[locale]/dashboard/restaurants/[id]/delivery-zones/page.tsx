"use client";

import { use, useState } from "react";
import { useTranslations } from "next-intl";
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
import { useGetMyRestaurantsQuery } from "@/lib/redux/services/restaurants-api";
import {
  useGetDeliveryZonesQuery,
  useDeleteDeliveryZoneMutation,
} from "@/lib/redux/services/delivery-zones-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { DeliveryZone } from "@/lib/redux/restaurant-types";
import { ZoneFormModal } from "./zone-form-modal";

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
  restaurantId,
  onEdit,
}: {
  zone: DeliveryZone;
  currency: string;
  restaurantId: string;
  onEdit: () => void;
}) {
  const t = useTranslations("DeliveryZonesPage");
  const { toast } = useToast();
  const [deleteZone, { isLoading: isDeleting }] = useDeleteDeliveryZoneMutation();
  const [confirming, setConfirming] = useState(false);

  function confirmDelete() {
    void deleteZone({ restaurantId, zoneId: zone._id })
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
          {currency} {zone.baseFee.toFixed(2)} {t("base")}
          {zone.perKmFee > 0 ? ` + ${currency} ${zone.perKmFee.toFixed(2)}/km` : ""}
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

function DeliveryZonesManager({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("DeliveryZonesPage");
  const { data: restaurants, isLoading: loadingRestaurant } = useGetMyRestaurantsQuery();
  const { data: zones, isLoading: loadingZones } = useGetDeliveryZonesQuery(restaurantId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryZone | null>(null);

  const restaurant = restaurants?.find((r) => r._id === restaurantId);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(zone: DeliveryZone) {
    setEditing(zone);
    setModalOpen(true);
  }

  if (loadingRestaurant || loadingZones) return <Skeleton className="h-64 w-full" />;
  if (!restaurant) {
    return <Alert variant="danger">{t("restaurantNotFound")}</Alert>;
  }

  const hasCoordinates = restaurant.address.lat != null && restaurant.address.lng != null;

  return (
    <div className="flex flex-col gap-4">
      {!hasCoordinates && (
        <Alert variant="warning">
          {t("noCoordinatesWarning")}{" "}
          <Link href={`/dashboard/restaurants/${restaurantId}`} className="underline">
            {t("restaurantDetailsPage")}
          </Link>
          . {t("flatFeeUntilThen")}
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">{t("zonesMatchedByDistance")}</p>
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
                currency={restaurant.currency}
                restaurantId={restaurantId}
                onEdit={() => openEdit(zone)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <ZoneFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        restaurantId={restaurantId}
        editing={editing}
      />
    </div>
  );
}

export default function DeliveryZonesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("DeliveryZonesPage");
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <Container className="max-w-2xl py-10">
        <h1 className="mb-6 text-2xl font-bold text-text">{t("deliveryZones")}</h1>
        <DeliveryZonesManager restaurantId={id} />
      </Container>
    </RequireRole>
  );
}
