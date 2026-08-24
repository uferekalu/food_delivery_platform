"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  useApproveRestaurantMutation,
  useListPendingRestaurantsQuery,
} from "@/lib/redux/services/restaurants-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { Restaurant } from "@/lib/redux/restaurant-types";

function PendingRestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const { toast } = useToast();
  const [approve, { isLoading }] = useApproveRestaurantMutation();

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">{restaurant.name}</span>
          <span className="text-sm text-text-muted">
            {restaurant.cuisineTypes.join(", ")} · {restaurant.currency} · {restaurant.address.city},{" "}
            {restaurant.address.state}
          </span>
        </div>
        <Button
          size="sm"
          className="self-start"
          isLoading={isLoading}
          onClick={() =>
            void approve(restaurant._id)
              .unwrap()
              .then(() => toast({ title: "Restaurant approved", variant: "success" }))
              .catch((err: unknown) =>
                toast({ title: "Couldn't approve restaurant", description: getErrorMessage(err), variant: "danger" }),
              )
          }
        >
          Approve
        </Button>
      </CardContent>
    </Card>
  );
}

export function RestaurantsTab() {
  const { data, isLoading } = useListPendingRestaurantsQuery();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState title="No restaurants awaiting approval" description="New restaurant applications will show up here." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((restaurant) => (
        <PendingRestaurantCard key={restaurant._id} restaurant={restaurant} />
      ))}
    </div>
  );
}
