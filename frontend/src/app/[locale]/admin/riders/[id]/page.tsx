"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useToast } from "@/components/ui/toast";
import { useListAllRidersQuery, useVerifyRiderMutation } from "@/lib/redux/services/riders-api";
import { getErrorMessage } from "@/lib/redux/error";

function DocumentLink({ label, url, viewLabel, notUploadedLabel }: { label: string; url: string | null; viewLabel: string; notUploadedLabel: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <span className="text-sm font-semibold text-text">{label}</span>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="w-fit text-sm text-primary hover:underline">
          {viewLabel}
        </a>
      ) : (
        <span className="text-sm text-danger">{notUploadedLabel}</span>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-sm text-text">{value}</span>
    </div>
  );
}

function AdminRiderReview({ id }: { id: string }) {
  const t = useTranslations("AdminRiderReviewPage");
  const tGovId = useTranslations("GovernmentIdType");
  const { toast } = useToast();
  // No single-rider admin endpoint exists yet — the full list is already admin-only and small
  // enough to fetch wholesale, same pattern as the restaurant dashboard's edit page.
  const { data: riders, isLoading, isError } = useListAllRidersQuery();
  const [verify, { isLoading: verifying }] = useVerifyRiderMutation();

  const rider = riders?.find((r) => r._id === id);

  if (isLoading) {
    return (
      <Container className="flex flex-col gap-4 py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </Container>
    );
  }

  if (isError || !rider) {
    return (
      <Container className="py-10">
        <EmptyState title={t("riderNotFound")} description={t("mayHaveBeenRemoved")} />
      </Container>
    );
  }

  const needsVehicleDocs = rider.vehicleType !== "bicycle";
  const missingRequirements: string[] = [];
  if (!rider.governmentIdDocumentUrl) missingRequirements.push(t("governmentIdDocument"));
  if (!rider.proofOfAddressDocumentUrl) missingRequirements.push(t("proofOfAddressDocument"));
  if (needsVehicleDocs) {
    if (!rider.driversLicenseDocumentUrl) missingRequirements.push(t("driversLicenseDocument"));
    if (!rider.vehicleRegistrationDocumentUrl) missingRequirements.push(t("vehicleRegistrationDocument"));
    if (!rider.vehiclePlateNumber) missingRequirements.push(t("vehiclePlateNumber"));
  }
  const canVerify = missingRequirements.length === 0;

  return (
    <Container className="flex flex-col gap-6 py-10">
      <Breadcrumbs
        items={[
          { label: t("admin"), href: "/admin" },
          { label: t("riders"), href: "/admin" },
          { label: rider.vehicleType },
        ]}
      />

      {!rider.isVerified && (
        <Alert variant="warning" title={t("awaitingVerification")}>
          {t("canSeeQueueCannotAccept")}
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold text-text capitalize">{t("vehicleRider", { vehicle: rider.vehicleType })}</h1>
        <Badge variant={rider.isVerified ? "success" : "warning"}>
          {rider.isVerified ? t("verified") : t("pending")}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("dateOfBirth")} value={new Date(rider.dateOfBirth).toLocaleDateString()} />
        <Field label={t("governmentIdType")} value={tGovId(rider.governmentIdType)} />
        <Field label={t("governmentIdNumber")} value={rider.governmentIdNumber} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DocumentLink label={t("governmentIdDocument")} url={rider.governmentIdDocumentUrl} viewLabel={t("viewDocument")} notUploadedLabel={t("notUploaded")} />
        <DocumentLink label={t("proofOfAddress")} url={rider.proofOfAddressDocumentUrl} viewLabel={t("viewDocument")} notUploadedLabel={t("notUploaded")} />
      </div>

      {needsVehicleDocs && (
        <>
          <h2 className="text-xl font-semibold text-text">{t("vehicleAndLicense")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("licenseNumber")} value={rider.driversLicenseNumber ?? t("notProvided")} />
            <Field
              label={t("licenseExpiry")}
              value={rider.driversLicenseExpiry ? new Date(rider.driversLicenseExpiry).toLocaleDateString() : t("notProvided")}
            />
            <Field label={t("vehiclePlateNumber")} value={rider.vehiclePlateNumber ?? t("notProvided")} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DocumentLink label={t("driversLicenseDocument")} url={rider.driversLicenseDocumentUrl} viewLabel={t("viewDocument")} notUploadedLabel={t("notUploaded")} />
            <DocumentLink label={t("vehicleRegistrationDocument")} url={rider.vehicleRegistrationDocumentUrl} viewLabel={t("viewDocument")} notUploadedLabel={t("notUploaded")} />
          </div>
        </>
      )}

      <h2 className="text-xl font-semibold text-text">{t("guarantor")}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("fullName")} value={rider.guarantor.fullName} />
        <Field label={t("phone")} value={rider.guarantor.phone} />
        <Field label={t("relationship")} value={rider.guarantor.relationship} />
        <Field label={t("address")} value={rider.guarantor.address} />
      </div>

      <h2 className="text-xl font-semibold text-text">{t("nextOfKin")}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("fullName")} value={rider.nextOfKinName} />
        <Field label={t("phone")} value={rider.nextOfKinPhone} />
        <Field label={t("relationship")} value={rider.nextOfKinRelationship} />
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        {!rider.isVerified && !canVerify && (
          <Alert variant="warning" title={t("cantVerifyYet")}>
            {t("missing", { items: missingRequirements.join(", ") })}
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          {rider.isVerified ? (
            <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
              {t("backToAdminDashboard")}
            </Link>
          ) : (
            <Button
              isLoading={verifying}
              disabled={!canVerify}
              onClick={() =>
                void verify(rider._id)
                  .unwrap()
                  .then(() => toast({ title: t("riderVerified"), variant: "success" }))
                  .catch((err: unknown) =>
                    toast({ title: t("couldNotVerifyRider"), description: getErrorMessage(err), variant: "danger" }),
                  )
              }
            >
              {t("verifyRider")}
            </Button>
          )}
        </div>
      </div>
    </Container>
  );
}

export default function AdminRiderReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole roles={["admin"]}>
      <AdminRiderReview id={id} />
    </RequireRole>
  );
}
