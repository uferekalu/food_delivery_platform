"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { RadioGroup, RadioOption } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { DocumentUpload } from "@/components/ui/document-upload";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { useAppSelector } from "@/lib/redux/hooks";
import { useApplyRiderMutation } from "@/lib/redux/services/riders-api";
import { useRefreshMutation } from "@/lib/redux/services/auth-api";
import { getErrorMessage } from "@/lib/redux/error";
import { GOVERNMENT_ID_TYPES, VEHICLE_TYPES } from "@/lib/redux/restaurant-types";
import type { GovernmentIdType, VehicleType } from "@/lib/redux/restaurant-types";

const VEHICLE_LABELS: Record<VehicleType, string> = {
  bicycle: "Bicycle",
  motorcycle: "Motorcycle",
  car: "Car",
  van: "Van",
};

const GOVERNMENT_ID_LABELS: Record<GovernmentIdType, string> = {
  national_id: "National ID",
  passport: "International passport",
  voters_card: "Voter's card",
  drivers_license: "Driver's license",
};

const GOVERNMENT_ID_OPTIONS = GOVERNMENT_ID_TYPES.map((value) => ({
  value,
  label: GOVERNMENT_ID_LABELS[value],
}));

const MINIMUM_RIDER_AGE = 18;

function ageInYears(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return NaN;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

const schema = z
  .object({
    vehicleType: z.enum(VEHICLE_TYPES),
    dateOfBirth: z.string().min(1, "Required"),
    governmentIdType: z.enum(GOVERNMENT_ID_TYPES),
    governmentIdNumber: z.string().min(4, "Too short").max(50),
    driversLicenseNumber: z.string().max(30).optional(),
    driversLicenseExpiry: z.string().optional(),
    vehiclePlateNumber: z.string().max(20).optional(),
    guarantorFullName: z.string().min(2, "Required").max(100),
    guarantorPhone: z.string().min(7, "Required").max(20),
    guarantorRelationship: z.string().min(2, "Required").max(100),
    guarantorAddress: z.string().min(5, "Required").max(200),
    nextOfKinName: z.string().min(2, "Required").max(100),
    nextOfKinPhone: z.string().min(7, "Required").max(20),
    nextOfKinRelationship: z.string().min(2, "Required").max(100),
  })
  .superRefine((values, ctx) => {
    if (values.dateOfBirth) {
      const age = ageInYears(values.dateOfBirth);
      if (Number.isNaN(age) || age < MINIMUM_RIDER_AGE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateOfBirth"],
          message: `You must be at least ${MINIMUM_RIDER_AGE} years old`,
        });
      }
    }
    if (values.vehicleType !== "bicycle") {
      if (!values.driversLicenseNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["driversLicenseNumber"],
          message: "Required for a motorized vehicle",
        });
      }
      if (!values.driversLicenseExpiry) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["driversLicenseExpiry"],
          message: "Required for a motorized vehicle",
        });
      }
      if (!values.vehiclePlateNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["vehiclePlateNumber"],
          message: "Required for a motorized vehicle",
        });
      }
    }
  });
type FormValues = z.infer<typeof schema>;

function ApplyForm() {
  const router = useRouter();
  const [applyRider, { isLoading }] = useApplyRiderMutation();
  const [refresh] = useRefreshMutation();
  const [error, setError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const [governmentIdDocumentUrl, setGovernmentIdDocumentUrl] = useState<string>();
  const [proofOfAddressDocumentUrl, setProofOfAddressDocumentUrl] = useState<string>();
  const [driversLicenseDocumentUrl, setDriversLicenseDocumentUrl] = useState<string>();
  const [vehicleRegistrationDocumentUrl, setVehicleRegistrationDocumentUrl] = useState<string>();

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { vehicleType: "motorcycle" },
  });

  const vehicleType = watch("vehicleType");
  const needsVehicleDocs = vehicleType !== "bicycle";

  const submit = (values: FormValues) => {
    const missingDocs: string[] = [];
    if (!governmentIdDocumentUrl) missingDocs.push("government ID document");
    if (!proofOfAddressDocumentUrl) missingDocs.push("proof of address document");
    if (needsVehicleDocs) {
      if (!driversLicenseDocumentUrl) missingDocs.push("driver's license document");
      if (!vehicleRegistrationDocumentUrl) missingDocs.push("vehicle registration document");
    }
    if (missingDocs.length > 0) {
      setDocumentError(`Please upload: ${missingDocs.join(", ")}`);
      return;
    }
    setDocumentError(null);
    setError(null);

    void applyRider({
      vehicleType: values.vehicleType,
      dateOfBirth: values.dateOfBirth,
      governmentIdType: values.governmentIdType,
      governmentIdNumber: values.governmentIdNumber,
      governmentIdDocumentUrl: governmentIdDocumentUrl!,
      proofOfAddressDocumentUrl: proofOfAddressDocumentUrl!,
      ...(needsVehicleDocs
        ? {
            driversLicenseNumber: values.driversLicenseNumber,
            driversLicenseExpiry: values.driversLicenseExpiry,
            driversLicenseDocumentUrl,
            vehiclePlateNumber: values.vehiclePlateNumber,
            vehicleRegistrationDocumentUrl,
          }
        : {}),
      guarantor: {
        fullName: values.guarantorFullName,
        phone: values.guarantorPhone,
        relationship: values.guarantorRelationship,
        address: values.guarantorAddress,
      },
      nextOfKinName: values.nextOfKinName,
      nextOfKinPhone: values.nextOfKinPhone,
      nextOfKinRelationship: values.nextOfKinRelationship,
    })
      .unwrap()
      .then(async () => {
        // The current access token still has the old role baked in — force an immediate
        // reissue so the rider dashboard's role gate passes right away instead of waiting up
        // to ~15min for the next silent refresh.
        await refresh().unwrap().catch(() => {});
        router.push("/rider");
      })
      .catch((err: unknown) => setError(getErrorMessage(err, "Couldn't submit your application")));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Become a rider</CardTitle>
        <CardDescription>
          We need a few details to keep the platform and its customers safe. An admin reviews
          everything below before you can accept deliveries.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-6" noValidate>
          {error && <Alert variant="danger">{error}</Alert>}

          <Controller
            control={control}
            name="vehicleType"
            render={({ field }) => (
              <RadioGroup label="Vehicle type" value={field.value} onChange={field.onChange}>
                {Object.entries(VEHICLE_LABELS).map(([value, label]) => (
                  <RadioOption key={value} value={value} label={label} />
                ))}
              </RadioGroup>
            )}
          />

          <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold text-text">Identity</h2>
            <FormField label="Date of birth" error={errors.dateOfBirth?.message} required>
              <Input type="date" {...register("dateOfBirth")} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Government ID type" error={errors.governmentIdType?.message} required>
                <Controller
                  control={control}
                  name="governmentIdType"
                  render={({ field }) => (
                    <Select options={GOVERNMENT_ID_OPTIONS} value={field.value} onChange={field.onChange} />
                  )}
                />
              </FormField>
              <FormField label="ID number" error={errors.governmentIdNumber?.message} required>
                <Input {...register("governmentIdNumber")} />
              </FormField>
            </div>
            <DocumentUpload
              label="Government ID document"
              folder="rider-documents"
              value={governmentIdDocumentUrl}
              onChange={(url) => {
                setGovernmentIdDocumentUrl(url);
                setDocumentError(null);
              }}
              hint="A clear photo or scan of the ID you selected above."
            />
            <DocumentUpload
              label="Proof of address"
              folder="rider-documents"
              value={proofOfAddressDocumentUrl}
              onChange={(url) => {
                setProofOfAddressDocumentUrl(url);
                setDocumentError(null);
              }}
              hint="A recent utility bill, bank statement, or tenancy agreement."
            />
          </div>

          {needsVehicleDocs && (
            <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-text">Vehicle & license</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Driver's license number" error={errors.driversLicenseNumber?.message} required>
                  <Input {...register("driversLicenseNumber")} />
                </FormField>
                <FormField label="License expiry date" error={errors.driversLicenseExpiry?.message} required>
                  <Input type="date" {...register("driversLicenseExpiry")} />
                </FormField>
              </div>
              <DocumentUpload
                label="Driver's license document"
                folder="rider-documents"
                value={driversLicenseDocumentUrl}
                onChange={(url) => {
                  setDriversLicenseDocumentUrl(url);
                  setDocumentError(null);
                }}
              />
              <FormField label="Vehicle plate number" error={errors.vehiclePlateNumber?.message} required>
                <Input {...register("vehiclePlateNumber")} />
              </FormField>
              <DocumentUpload
                label="Vehicle registration document"
                folder="rider-documents"
                value={vehicleRegistrationDocumentUrl}
                onChange={(url) => {
                  setVehicleRegistrationDocumentUrl(url);
                  setDocumentError(null);
                }}
                hint="Proof the vehicle is registered and roadworthy."
              />
            </div>
          )}

          {documentError && <Alert variant="danger">{documentError}</Alert>}

          <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold text-text">Guarantor</h2>
            <p className="text-xs text-text-muted">
              Someone who can vouch for you — not a family member you live with.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Full name" error={errors.guarantorFullName?.message} required>
                <Input {...register("guarantorFullName")} />
              </FormField>
              <FormField label="Phone number" error={errors.guarantorPhone?.message} required>
                <Input {...register("guarantorPhone")} />
              </FormField>
              <FormField label="Relationship to you" error={errors.guarantorRelationship?.message} required>
                <Input {...register("guarantorRelationship")} />
              </FormField>
              <FormField label="Address" error={errors.guarantorAddress?.message} required>
                <Input {...register("guarantorAddress")} />
              </FormField>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold text-text">Next of kin</h2>
            <p className="text-xs text-text-muted">Who we contact in an emergency.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Full name" error={errors.nextOfKinName?.message} required>
                <Input {...register("nextOfKinName")} />
              </FormField>
              <FormField label="Phone number" error={errors.nextOfKinPhone?.message} required>
                <Input {...register("nextOfKinPhone")} />
              </FormField>
              <FormField label="Relationship to you" error={errors.nextOfKinRelationship?.message} required>
                <Input {...register("nextOfKinRelationship")} />
              </FormField>
            </div>
          </div>

          <Button type="submit" isLoading={isLoading} className="self-start">
            Submit application
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ApplyGate() {
  const { user, status } = useAppSelector((state) => state.auth);

  if (status === "idle") {
    return (
      <Container className="flex justify-center py-24">
        <Spinner size="lg" label="Checking your session" />
      </Container>
    );
  }

  if (status !== "authenticated" || !user) {
    return (
      <Container className="py-10">
        <EmptyState
          title="Log in to apply"
          description="You'll need an account to apply as a rider."
          action={
            <NextLink href="/login" className={buttonVariants({ variant: "primary" })}>
              Log in
            </NextLink>
          }
        />
      </Container>
    );
  }

  if (user.role === "rider") {
    return (
      <Container className="py-10">
        <EmptyState
          title="You're already a rider"
          description="Head to your dashboard to go online and accept deliveries."
          action={
            <NextLink href="/rider" className={buttonVariants({ variant: "primary" })}>
              Go to rider dashboard
            </NextLink>
          }
        />
      </Container>
    );
  }

  if (user.role === "admin") {
    return (
      <Container className="py-10">
        <Alert variant="neutral">Admin accounts don&apos;t need a rider profile.</Alert>
      </Container>
    );
  }

  if (user.role === "restaurant_owner") {
    return (
      <Container className="py-10">
        <Alert variant="neutral">
          Restaurant owner accounts can&apos;t also become riders — becoming a rider would
          replace your account role and you&apos;d lose access to your restaurant dashboard.
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="max-w-2xl py-10">
      <h1 className="mb-6 text-2xl font-bold text-text">Become a rider</h1>
      <ApplyForm />
    </Container>
  );
}

export default function RiderApplyPage() {
  return <ApplyGate />;
}
