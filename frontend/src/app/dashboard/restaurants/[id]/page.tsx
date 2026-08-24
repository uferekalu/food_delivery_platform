"use client";

import { use, useState } from "react";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useGetMyRestaurantsQuery, useUpdateRestaurantMutation } from "@/lib/redux/services/restaurants-api";
import { getErrorMessage } from "@/lib/redux/error";
import { RestaurantForm } from "../restaurant-form";

function EditRestaurantForm({ id }: { id: string }) {
  const { toast } = useToast();
  const { data: restaurants, isLoading } = useGetMyRestaurantsQuery();
  const [updateRestaurant, { isLoading: saving }] = useUpdateRestaurantMutation();
  const [error, setError] = useState<string | null>(null);

  const restaurant = restaurants?.find((r) => r._id === id);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!restaurant) {
    return <Alert variant="danger">Restaurant not found, or you don&apos;t have access to it.</Alert>;
  }

  return (
    <>
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <RestaurantForm
        defaultValues={{
          name: restaurant.name,
          description: restaurant.description,
          cuisineTypesRaw: restaurant.cuisineTypes.join(", "),
          currency: restaurant.currency,
          country: restaurant.country,
          line1: restaurant.address.line1,
          line2: restaurant.address.line2,
          city: restaurant.address.city,
          state: restaurant.address.state,
          postalCode: restaurant.address.postalCode,
          lat: restaurant.address.lat,
          lng: restaurant.address.lng,
          priceLevel: String(restaurant.priceLevel) as "1" | "2" | "3" | "4",
          estimatedDeliveryMinutes: restaurant.estimatedDeliveryMinutes ?? undefined,
        }}
        defaultOpeningHours={restaurant.openingHours}
        defaultLogoUrl={restaurant.logoUrl}
        defaultCoverUrl={restaurant.coverUrl}
        isSubmitting={saving}
        submitLabel="Save changes"
        onSubmit={async (input) => {
          setError(null);
          try {
            await updateRestaurant({ id, body: input }).unwrap();
            toast({ title: "Saved", variant: "success" });
          } catch (err) {
            setError(getErrorMessage(err, "Couldn't save changes"));
          }
        }}
      />
    </>
  );
}

export default function EditRestaurantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <Container className="max-w-2xl py-10">
        <h1 className="mb-6 text-2xl font-bold text-text">Edit restaurant</h1>
        <EditRestaurantForm id={id} />
      </Container>
    </RequireRole>
  );
}
