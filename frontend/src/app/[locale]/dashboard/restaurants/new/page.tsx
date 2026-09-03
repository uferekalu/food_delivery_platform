"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { useCreateRestaurantMutation } from "@/lib/redux/services/restaurants-api";
import { getErrorMessage } from "@/lib/redux/error";
import { RestaurantForm } from "../restaurant-form";

function NewRestaurantForm() {
  const t = useTranslations("NewRestaurantPage");
  const router = useRouter();
  const { toast } = useToast();
  const [createRestaurant, { isLoading }] = useCreateRestaurantMutation();
  const [error, setError] = useState<string | null>(null);

  return (
    <Container className="max-w-2xl py-10">
      <h1 className="mb-6 text-2xl font-bold text-text">{t("addARestaurant")}</h1>
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <RestaurantForm
        isSubmitting={isLoading}
        submitLabel={t("createRestaurant")}
        onSubmit={async (input) => {
          setError(null);
          try {
            const restaurant = await createRestaurant(input).unwrap();
            toast({
              title: t("restaurantCreated"),
              description: t("pendingAdminApproval"),
              variant: "success",
            });
            router.push(`/dashboard/restaurants/${restaurant._id}`);
          } catch (err) {
            setError(getErrorMessage(err, t("couldNotCreateRestaurant")));
          }
        }}
      />
    </Container>
  );
}

export default function NewRestaurantPage() {
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <NewRestaurantForm />
    </RequireRole>
  );
}
