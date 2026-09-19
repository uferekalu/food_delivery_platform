"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/modal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Rating } from "@/components/ui/rating";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useGetAvailableRidersQuery, useAssignOrderRiderMutation } from "@/lib/redux/services/orders-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { Order } from "@/lib/redux/restaurant-types";

/**
 * Store-driven rider assignment (docs/ROADMAP.md FDP-133) — replaces the old "waiting for a
 * rider" dead end with the seller picking a specific nearby rider themselves, and staying able
 * to see/contact/reassign them all the way through delivery, rather than the order silently
 * disappearing from their queue the moment a rider was attached.
 */
function RiderPickerModal({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  const t = useTranslations("DashboardOrdersPage");
  const tVehicle = useTranslations("VehicleType");
  const { toast } = useToast();
  const { data: riders, isLoading } = useGetAvailableRidersQuery(order._id, { skip: !open });
  const [assignRider, { isLoading: isAssigning }] = useAssignOrderRiderMutation();

  function handleAssign(riderUserId: string) {
    void assignRider({ orderId: order._id, riderUserId })
      .unwrap()
      .then(() => {
        toast({ title: t("riderAssignedToast"), variant: "success" });
        onClose();
      })
      .catch((err: unknown) => {
        toast({ title: t("couldNotAssignRider"), description: getErrorMessage(err), variant: "danger" });
      });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={order.status === "ASSIGNED_TO_RIDER" ? t("reassignRider") : t("assignRider")}
      description={t("autoDispatchNotice")}
      size="md"
    >
      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : !riders || riders.length === 0 ? (
          <EmptyState title={t("noRidersNearby")} description={t("noRidersNearbyDescription")} />
        ) : (
          riders.map((rider) => (
            <div
              key={rider.riderId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-text">{rider.name}</span>
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <Rating value={rider.rating} size="sm" label={rider.name} />
                  <span>({rider.reviewCount})</span>
                  <Badge variant="neutral">{tVehicle(rider.vehicleType)}</Badge>
                  <span>{t("distanceAway", { distance: rider.distanceKm })}</span>
                </div>
              </div>
              <Button size="sm" isLoading={isAssigning} onClick={() => handleAssign(rider.riderId)}>
                {t("assign")}
              </Button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

/** Shown in place of the old plain "waiting for a rider" text once an order is READY_FOR_PICKUP
 * and still unassigned. */
export function AssignRiderAction({ order }: { order: Order }) {
  const t = useTranslations("DashboardOrdersPage");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-text-muted">{t("waitingForARider")}</p>
      <Button size="sm" onClick={() => setOpen(true)}>
        {t("assignRider")}
      </Button>
      <RiderPickerModal order={order} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** Shown once a rider is attached (ASSIGNED_TO_RIDER / PICKED_UP / OUT_FOR_DELIVERY) — who they
 * are, a way to call them, and (only while still ASSIGNED_TO_RIDER) a way to reassign. */
export function RiderContactCard({ order }: { order: Order }) {
  const t = useTranslations("DashboardOrdersPage");
  const tVehicle = useTranslations("VehicleType");
  const [open, setOpen] = useState(false);
  const rider = order.rider;

  if (!rider) {
    return <p className="text-sm text-text-muted">{t("riderAssignedNoContact")}</p>;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text">{rider.name}</span>
        <Badge variant="info">{tVehicle(rider.vehicleType)}</Badge>
      </div>
      <Rating value={rider.rating} size="sm" label={rider.name} />
      <div className="flex flex-wrap items-center gap-2">
        {rider.phone ? (
          <a href={`tel:${rider.phone}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            {t("callRider")}
          </a>
        ) : (
          <span className="text-xs text-text-muted">{t("noPhoneOnFile")}</span>
        )}
        {order.status === "ASSIGNED_TO_RIDER" && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            {t("reassignRider")}
          </Button>
        )}
      </div>
      <RiderPickerModal order={order} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
