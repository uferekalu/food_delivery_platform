"use client";

import { use, useState } from "react";
import { useTranslations } from "next-intl";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useGetMyStoresQuery, useUpdateStoreMutation } from "@/lib/redux/services/stores-api";
import { getErrorMessage } from "@/lib/redux/error";
import { StoreForm } from "../store-form";

function EditStoreForm({ id }: { id: string }) {
  const t = useTranslations("EditStorePage");
  const { toast } = useToast();
  const { data: stores, isLoading } = useGetMyStoresQuery();
  const [updateStore, { isLoading: saving }] = useUpdateStoreMutation();
  const [error, setError] = useState<string | null>(null);

  const store = stores?.find((s) => s._id === id);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!store) {
    return <Alert variant="danger">{t("storeNotFound")}</Alert>;
  }

  return (
    <>
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <StoreForm
        defaultValues={{
          name: store.name,
          description: store.description,
          type: store.type,
          tagsRaw: store.tags.join(", "),
          currency: store.currency,
          country: store.country,
          line1: store.address.line1,
          line2: store.address.line2,
          city: store.address.city,
          state: store.address.state,
          postalCode: store.address.postalCode,
          lat: store.address.lat,
          lng: store.address.lng,
          estimatedDeliveryMinutes: store.estimatedDeliveryMinutes ?? undefined,
        }}
        defaultLogoUrl={store.logoUrl}
        defaultCoverUrl={store.coverUrl}
        defaultComplianceDocumentUrl={store.complianceDocumentUrl}
        isSubmitting={saving}
        submitLabel={t("saveChanges")}
        onSubmit={async (input) => {
          setError(null);
          try {
            await updateStore({ id, body: input }).unwrap();
            toast({ title: t("saved"), variant: "success" });
          } catch (err) {
            setError(getErrorMessage(err, t("couldNotSaveChanges")));
          }
        }}
      />
    </>
  );
}

export default function EditStorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("EditStorePage");
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <Container className="max-w-2xl py-10">
        <h1 className="mb-6 text-2xl font-bold text-text">{t("editStore")}</h1>
        <EditStoreForm id={id} />
      </Container>
    </RequireRole>
  );
}
