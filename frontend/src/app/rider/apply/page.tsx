"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { RadioGroup, RadioOption } from "@/components/ui/radio-group";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { useAppSelector } from "@/lib/redux/hooks";
import { useApplyRiderMutation } from "@/lib/redux/services/riders-api";
import { useRefreshMutation } from "@/lib/redux/services/auth-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { VehicleType } from "@/lib/redux/restaurant-types";

const VEHICLE_LABELS: Record<VehicleType, string> = {
  bicycle: "Bicycle",
  motorcycle: "Motorcycle",
  car: "Car",
  van: "Van",
};

function ApplyForm() {
  const router = useRouter();
  const [vehicleType, setVehicleType] = useState<VehicleType>("motorcycle");
  const [applyRider, { isLoading }] = useApplyRiderMutation();
  const [refresh] = useRefreshMutation();
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await applyRider({ vehicleType }).unwrap();
      // The current access token still has the old role baked in — force an immediate reissue
      // so the rider dashboard's role gate passes right away instead of waiting up to ~15min
      // for the next silent refresh.
      await refresh().unwrap().catch(() => {});
      router.push("/rider");
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't submit your application"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Become a rider</CardTitle>
        <CardDescription>
          Pick your vehicle to apply. An admin verifies new riders before you can accept
          deliveries.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error && <Alert variant="danger">{error}</Alert>}
        <RadioGroup label="Vehicle type" value={vehicleType} onChange={(v) => setVehicleType(v as VehicleType)}>
          {Object.entries(VEHICLE_LABELS).map(([value, label]) => (
            <RadioOption key={value} value={value} label={label} />
          ))}
        </RadioGroup>
        <Button isLoading={isLoading} onClick={() => void submit()} className="self-start">
          Apply
        </Button>
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
    <Container className="max-w-lg py-10">
      <h1 className="mb-6 text-2xl font-bold text-text">Become a rider</h1>
      <ApplyForm />
    </Container>
  );
}

export default function RiderApplyPage() {
  return <ApplyGate />;
}
