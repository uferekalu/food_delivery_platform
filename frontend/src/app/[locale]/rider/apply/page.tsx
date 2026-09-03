"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
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

function ApplyForm() {
  const t = useTranslations("RiderApplyPage");
  const tVehicle = useTranslations("VehicleType");
  const tGovId = useTranslations("GovernmentIdType");
  const router = useRouter();
  const [applyRider, { isLoading }] = useApplyRiderMutation();
  const [refresh] = useRefreshMutation();
  const [error, setError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const [governmentIdDocumentUrl, setGovernmentIdDocumentUrl] = useState<string>();
  const [proofOfAddressDocumentUrl, setProofOfAddressDocumentUrl] = useState<string>();
  const [driversLicenseDocumentUrl, setDriversLicenseDocumentUrl] = useState<string>();
  const [vehicleRegistrationDocumentUrl, setVehicleRegistrationDocumentUrl] = useState<string>();

  const GOVERNMENT_ID_OPTIONS = GOVERNMENT_ID_TYPES.map((value) => ({ value, label: tGovId(value) }));

  const schema = z
    .object({
      vehicleType: z.enum(VEHICLE_TYPES),
      dateOfBirth: z.string().min(1, t("required")),
      governmentIdType: z.enum(GOVERNMENT_ID_TYPES),
      governmentIdNumber: z.string().min(4, t("tooShort")).max(50),
      driversLicenseNumber: z.string().max(30).optional(),
      driversLicenseExpiry: z.string().optional(),
      vehiclePlateNumber: z.string().max(20).optional(),
      guarantorFullName: z.string().min(2, t("required")).max(100),
      guarantorPhone: z.string().min(7, t("required")).max(20),
      guarantorRelationship: z.string().min(2, t("required")).max(100),
      guarantorAddress: z.string().min(5, t("required")).max(200),
      nextOfKinName: z.string().min(2, t("required")).max(100),
      nextOfKinPhone: z.string().min(7, t("required")).max(20),
      nextOfKinRelationship: z.string().min(2, t("required")).max(100),
    })
    .superRefine((values, ctx) => {
      if (values.dateOfBirth) {
        const age = ageInYears(values.dateOfBirth);
        if (Number.isNaN(age) || age < MINIMUM_RIDER_AGE) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["dateOfBirth"],
            message: t("mustBeAtLeastAge", { age: MINIMUM_RIDER_AGE }),
          });
        }
      }
      if (values.vehicleType !== "bicycle") {
        if (!values.driversLicenseNumber) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["driversLicenseNumber"], message: t("requiredForMotorized") });
        }
        if (!values.driversLicenseExpiry) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["driversLicenseExpiry"], message: t("requiredForMotorized") });
        }
        if (!values.vehiclePlateNumber) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vehiclePlateNumber"], message: t("requiredForMotorized") });
        }
      }
    });
  type FormValues = z.infer<typeof schema>;

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
    if (!governmentIdDocumentUrl) missingDocs.push(t("governmentIdDocument"));
    if (!proofOfAddressDocumentUrl) missingDocs.push(t("proofOfAddressDocument"));
    if (needsVehicleDocs) {
      if (!driversLicenseDocumentUrl) missingDocs.push(t("driversLicenseDocument"));
      if (!vehicleRegistrationDocumentUrl) missingDocs.push(t("vehicleRegistrationDocument"));
    }
    if (missingDocs.length > 0) {
      setDocumentError(t("pleaseUpload", { items: missingDocs.join(", ") }));
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
      .catch((err: unknown) => setError(getErrorMessage(err, t("couldNotSubmitApplication"))));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("becomeARider")}</CardTitle>
        <CardDescription>{t("weNeedAFewDetails")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-6" noValidate>
          {error && <Alert variant="danger">{error}</Alert>}

          <Controller
            control={control}
            name="vehicleType"
            render={({ field }) => (
              <RadioGroup label={t("vehicleTypeLabel")} value={field.value} onChange={field.onChange}>
                {VEHICLE_TYPES.map((value) => (
                  <RadioOption key={value} value={value} label={tVehicle(value)} />
                ))}
              </RadioGroup>
            )}
          />

          <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold text-text">{t("identity")}</h2>
            <FormField label={t("dateOfBirth")} error={errors.dateOfBirth?.message} required>
              <Input type="date" {...register("dateOfBirth")} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("governmentIdType")} error={errors.governmentIdType?.message} required>
                <Controller
                  control={control}
                  name="governmentIdType"
                  render={({ field }) => (
                    <Select options={GOVERNMENT_ID_OPTIONS} value={field.value} onChange={field.onChange} />
                  )}
                />
              </FormField>
              <FormField label={t("idNumber")} error={errors.governmentIdNumber?.message} required>
                <Input {...register("governmentIdNumber")} />
              </FormField>
            </div>
            <DocumentUpload
              label={t("governmentIdDocument")}
              folder="rider-documents"
              value={governmentIdDocumentUrl}
              onChange={(url) => {
                setGovernmentIdDocumentUrl(url);
                setDocumentError(null);
              }}
              hint={t("governmentIdDocumentHint")}
            />
            <DocumentUpload
              label={t("proofOfAddress")}
              folder="rider-documents"
              value={proofOfAddressDocumentUrl}
              onChange={(url) => {
                setProofOfAddressDocumentUrl(url);
                setDocumentError(null);
              }}
              hint={t("proofOfAddressHint")}
            />
          </div>

          {needsVehicleDocs && (
            <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-text">{t("vehicleAndLicense")}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t("driversLicenseNumber")} error={errors.driversLicenseNumber?.message} required>
                  <Input {...register("driversLicenseNumber")} />
                </FormField>
                <FormField label={t("licenseExpiryDate")} error={errors.driversLicenseExpiry?.message} required>
                  <Input type="date" {...register("driversLicenseExpiry")} />
                </FormField>
              </div>
              <DocumentUpload
                label={t("driversLicenseDocument")}
                folder="rider-documents"
                value={driversLicenseDocumentUrl}
                onChange={(url) => {
                  setDriversLicenseDocumentUrl(url);
                  setDocumentError(null);
                }}
              />
              <FormField label={t("vehiclePlateNumber")} error={errors.vehiclePlateNumber?.message} required>
                <Input {...register("vehiclePlateNumber")} />
              </FormField>
              <DocumentUpload
                label={t("vehicleRegistrationDocument")}
                folder="rider-documents"
                value={vehicleRegistrationDocumentUrl}
                onChange={(url) => {
                  setVehicleRegistrationDocumentUrl(url);
                  setDocumentError(null);
                }}
                hint={t("vehicleRegistrationHint")}
              />
            </div>
          )}

          {documentError && <Alert variant="danger">{documentError}</Alert>}

          <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold text-text">{t("guarantor")}</h2>
            <p className="text-xs text-text-muted">{t("guarantorHint")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("fullName")} error={errors.guarantorFullName?.message} required>
                <Input {...register("guarantorFullName")} />
              </FormField>
              <FormField label={t("phoneNumber")} error={errors.guarantorPhone?.message} required>
                <Input {...register("guarantorPhone")} />
              </FormField>
              <FormField label={t("relationshipToYou")} error={errors.guarantorRelationship?.message} required>
                <Input {...register("guarantorRelationship")} />
              </FormField>
              <FormField label={t("address")} error={errors.guarantorAddress?.message} required>
                <Input {...register("guarantorAddress")} />
              </FormField>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold text-text">{t("nextOfKin")}</h2>
            <p className="text-xs text-text-muted">{t("nextOfKinHint")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("fullName")} error={errors.nextOfKinName?.message} required>
                <Input {...register("nextOfKinName")} />
              </FormField>
              <FormField label={t("phoneNumber")} error={errors.nextOfKinPhone?.message} required>
                <Input {...register("nextOfKinPhone")} />
              </FormField>
              <FormField label={t("relationshipToYou")} error={errors.nextOfKinRelationship?.message} required>
                <Input {...register("nextOfKinRelationship")} />
              </FormField>
            </div>
          </div>

          <Button type="submit" isLoading={isLoading} className="self-start">
            {t("submitApplication")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ApplyGate() {
  const t = useTranslations("RiderApplyPage");
  const { user, status } = useAppSelector((state) => state.auth);

  if (status === "idle") {
    return (
      <Container className="flex justify-center py-24">
        <Spinner size="lg" label={t("checkingSession")} />
      </Container>
    );
  }

  if (status !== "authenticated" || !user) {
    return (
      <Container className="py-10">
        <EmptyState
          title={t("logInToApply")}
          description={t("needAccountToApply")}
          action={
            <Link href="/login" className={buttonVariants({ variant: "primary" })}>
              {t("logIn")}
            </Link>
          }
        />
      </Container>
    );
  }

  if (user.role === "rider") {
    return (
      <Container className="py-10">
        <EmptyState
          title={t("youreAlreadyARider")}
          description={t("headToYourDashboard")}
          action={
            <Link href="/rider" className={buttonVariants({ variant: "primary" })}>
              {t("goToRiderDashboard")}
            </Link>
          }
        />
      </Container>
    );
  }

  if (user.role === "admin") {
    return (
      <Container className="py-10">
        <Alert variant="neutral">{t("adminAccountsDontNeedRiderProfile")}</Alert>
      </Container>
    );
  }

  if (user.role === "restaurant_owner") {
    return (
      <Container className="py-10">
        <Alert variant="neutral">{t("restaurantOwnersCantBecomeRiders")}</Alert>
      </Container>
    );
  }

  return (
    <Container className="max-w-2xl py-10">
      <h1 className="mb-6 text-2xl font-bold text-text">{t("becomeARider")}</h1>
      <ApplyForm />
    </Container>
  );
}

export default function RiderApplyPage() {
  return <ApplyGate />;
}
