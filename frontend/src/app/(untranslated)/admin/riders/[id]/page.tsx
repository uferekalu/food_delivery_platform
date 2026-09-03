"use client";

import { use } from "react";
import NextLink from "next/link";
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
import type { GovernmentIdType } from "@/lib/redux/restaurant-types";

const GOVERNMENT_ID_LABELS: Record<GovernmentIdType, string> = {
  national_id: "National ID",
  passport: "International passport",
  voters_card: "Voter's card",
  drivers_license: "Driver's license",
};

function DocumentLink({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <span className="text-sm font-semibold text-text">{label}</span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit text-sm text-primary hover:underline"
        >
          View document →
        </a>
      ) : (
        <span className="text-sm text-danger">Not uploaded</span>
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
        <EmptyState title="Rider not found" description="It may have been removed." />
      </Container>
    );
  }

  const needsVehicleDocs = rider.vehicleType !== "bicycle";
  const missingRequirements: string[] = [];
  if (!rider.governmentIdDocumentUrl) missingRequirements.push("government ID document");
  if (!rider.proofOfAddressDocumentUrl) missingRequirements.push("proof of address document");
  if (needsVehicleDocs) {
    if (!rider.driversLicenseDocumentUrl) missingRequirements.push("driver's license document");
    if (!rider.vehicleRegistrationDocumentUrl) missingRequirements.push("vehicle registration document");
    if (!rider.vehiclePlateNumber) missingRequirements.push("vehicle plate number");
  }
  const canVerify = missingRequirements.length === 0;

  return (
    <Container className="flex flex-col gap-6 py-10">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Riders", href: "/admin" },
          { label: rider.vehicleType },
        ]}
      />

      {!rider.isVerified && (
        <Alert variant="warning" title="Awaiting verification">
          This rider can see the delivery queue but can&apos;t accept orders yet.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold text-text capitalize">{rider.vehicleType} rider</h1>
        <Badge variant={rider.isVerified ? "success" : "warning"}>
          {rider.isVerified ? "Verified" : "Pending"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date of birth" value={new Date(rider.dateOfBirth).toLocaleDateString()} />
        <Field label="Government ID type" value={GOVERNMENT_ID_LABELS[rider.governmentIdType]} />
        <Field label="Government ID number" value={rider.governmentIdNumber} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DocumentLink label="Government ID document" url={rider.governmentIdDocumentUrl} />
        <DocumentLink label="Proof of address" url={rider.proofOfAddressDocumentUrl} />
      </div>

      {needsVehicleDocs && (
        <>
          <h2 className="text-xl font-semibold text-text">Vehicle & license</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="License number" value={rider.driversLicenseNumber ?? "Not provided"} />
            <Field
              label="License expiry"
              value={rider.driversLicenseExpiry ? new Date(rider.driversLicenseExpiry).toLocaleDateString() : "Not provided"}
            />
            <Field label="Vehicle plate number" value={rider.vehiclePlateNumber ?? "Not provided"} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DocumentLink label="Driver's license document" url={rider.driversLicenseDocumentUrl} />
            <DocumentLink label="Vehicle registration document" url={rider.vehicleRegistrationDocumentUrl} />
          </div>
        </>
      )}

      <h2 className="text-xl font-semibold text-text">Guarantor</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" value={rider.guarantor.fullName} />
        <Field label="Phone" value={rider.guarantor.phone} />
        <Field label="Relationship" value={rider.guarantor.relationship} />
        <Field label="Address" value={rider.guarantor.address} />
      </div>

      <h2 className="text-xl font-semibold text-text">Next of kin</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" value={rider.nextOfKinName} />
        <Field label="Phone" value={rider.nextOfKinPhone} />
        <Field label="Relationship" value={rider.nextOfKinRelationship} />
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        {!rider.isVerified && !canVerify && (
          <Alert variant="warning" title="Can't verify yet">
            Missing: {missingRequirements.join(", ")}.
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          {rider.isVerified ? (
            <NextLink href="/admin" className={buttonVariants({ variant: "outline" })}>
              Back to admin dashboard
            </NextLink>
          ) : (
            <Button
              isLoading={verifying}
              disabled={!canVerify}
              onClick={() =>
                void verify(rider._id)
                  .unwrap()
                  .then(() => toast({ title: "Rider verified", variant: "success" }))
                  .catch((err: unknown) =>
                    toast({ title: "Couldn't verify rider", description: getErrorMessage(err), variant: "danger" }),
                  )
              }
            >
              Verify rider
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
