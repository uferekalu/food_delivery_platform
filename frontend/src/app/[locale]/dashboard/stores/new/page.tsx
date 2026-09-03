"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { useCreateStoreMutation } from "@/lib/redux/services/stores-api";
import { getErrorMessage } from "@/lib/redux/error";
import { StoreForm } from "../store-form";

function NewStoreForm() {
  const t = useTranslations("NewStorePage");
  const router = useRouter();
  const { toast } = useToast();
  const [createStore, { isLoading }] = useCreateStoreMutation();
  const [error, setError] = useState<string | null>(null);

  return (
    <Container className="max-w-2xl py-10">
      <h1 className="mb-6 text-2xl font-bold text-text">{t("addAStore")}</h1>
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <StoreForm
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

export default function NewStorePage() {
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <NewStoreForm />
    </RequireRole>
  );
}
