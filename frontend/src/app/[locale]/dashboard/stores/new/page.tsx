"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useCreateStoreMutation } from "@/lib/redux/services/stores-api";
import { getErrorMessage } from "@/lib/redux/error";
import { STORE_TYPES, type StoreType } from "@/lib/redux/restaurant-types";
import { StoreForm } from "../store-form";

function isStoreType(value: string | null): value is StoreType {
  return (STORE_TYPES as readonly string[]).includes(value ?? "");
}

function NewStoreForm() {
  const t = useTranslations("NewStorePage");
  const router = useRouter();
  const { toast } = useToast();
  const [createStore, { isLoading }] = useCreateStoreMutation();
  const [error, setError] = useState<string | null>(null);
  // Lets a registration flow that already asked "groceries or pharmacy?" (or any other
  // "sell groceries/pharmacy items" CTA) carry that choice straight into the form instead of
  // making the owner pick the type a second time right after picking it once at signup.
  const searchParams = useSearchParams();
  const presetType = searchParams.get("type");
  const defaultValues = isStoreType(presetType) ? { type: presetType } : undefined;

  return (
    <Container className="max-w-2xl py-10">
      <h1 className="mb-6 text-2xl font-bold text-text">{t("addAStore")}</h1>
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <StoreForm
        defaultValues={defaultValues}
        isSubmitting={isLoading}
        submitLabel={t("createStore")}
        onSubmit={async (input) => {
          setError(null);
          try {
            const store = await createStore(input).unwrap();
            toast({ title: t("storeCreated"), description: t("pendingAdminApproval"), variant: "success" });
            router.push(`/dashboard/stores/${store._id}`);
          } catch (err) {
            setError(getErrorMessage(err, t("couldNotCreateStore")));
          }
        }}
      />
    </Container>
  );
}

/**
 * `useSearchParams()` opts the tree above it out of static prerendering unless wrapped in
 * `Suspense` (Next.js would otherwise fail the build with "URL data in a Client Component
 * outside of Suspense") — same reasoning as the register page's own Suspense boundary.
 */
export default function NewStorePage() {
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <Suspense fallback={<Container className="max-w-2xl py-10"><Skeleton className="h-96 w-full" /></Container>}>
        <NewStoreForm />
      </Suspense>
    </RequireRole>
  );
}
