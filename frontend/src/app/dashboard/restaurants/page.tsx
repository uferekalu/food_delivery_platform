"use client";

import NextLink from "next/link";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetMyRestaurantsQuery, useToggleRestaurantOpenMutation } from "@/lib/redux/services/restaurants-api";

function MyRestaurantsList() {
  const { data, isLoading } = useGetMyRestaurantsQuery();
  const [toggleOpen, { isLoading: toggling }] = useToggleRestaurantOpenMutation();

  return (
    <Container className="flex flex-col gap-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">My restaurants</h1>
        <NextLink href="/dashboard/restaurants/new" className={buttonVariants({ variant: "primary" })}>
          Add restaurant
        </NextLink>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No restaurants yet"
          description="Create your first restaurant to start building your menu."
          action={
            <NextLink
              href="/dashboard/restaurants/new"
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              Add restaurant
            </NextLink>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.map((restaurant) => (
            <Card key={restaurant._id}>
              <CardHeader>
                <CardTitle>{restaurant.name}</CardTitle>
                <CardDescription>{restaurant.cuisineTypes.join(", ")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant={restaurant.isApproved ? "success" : "warning"}>
                  {restaurant.isApproved ? "Approved" : "Pending approval"}
                </Badge>
                <Badge variant={restaurant.isOpen ? "success" : "neutral"}>
                  {restaurant.isOpen ? "Open" : "Closed"}
                </Badge>
              </CardContent>
              <CardFooter className="flex-wrap">
                <NextLink
                  href={`/dashboard/restaurants/${restaurant._id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Edit
                </NextLink>
                <NextLink
                  href={`/dashboard/restaurants/${restaurant._id}/menu`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Manage menu
                </NextLink>
                <NextLink
                  href={`/dashboard/restaurants/${restaurant._id}/orders`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Order queue
                </NextLink>
                <NextLink
                  href={`/dashboard/restaurants/${restaurant._id}/delivery-zones`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Delivery zones
                </NextLink>
                <Button
                  variant="ghost"
                  size="sm"
                  isLoading={toggling}
                  onClick={() => void toggleOpen(restaurant._id)}
                >
                  {restaurant.isOpen ? "Close" : "Open"}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </Container>
  );
}

export default function DashboardRestaurantsPage() {
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <MyRestaurantsList />
    </RequireRole>
  );
}
