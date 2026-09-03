"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetMyRestaurantsQuery, useToggleRestaurantOpenMutation } from "@/lib/redux/services/restaurants-api";

function MyRestaurantsList() {
  const t = useTranslations("DashboardRestaurantsPage");
  const { data, isLoading } = useGetMyRestaurantsQuery();
  const [toggleOpen, { isLoading: toggling }] = useToggleRestaurantOpenMutation();

  return (
    <Container className="flex flex-col gap-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">{t("myRestaurants")}</h1>
        <Link href="/dashboard/restaurants/new" className={buttonVariants({ variant: "primary" })}>
          {t("addRestaurant")}
        </Link>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title={t("noRestaurantsYet")}
          description={t("createFirstRestaurant")}
          action={
            <Link href="/dashboard/restaurants/new" className={buttonVariants({ variant: "primary", size: "sm" })}>
              {t("addRestaurant")}
            </Link>
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
                  {restaurant.isApproved ? t("approved") : t("pendingApproval")}
                </Badge>
                <Badge variant={restaurant.isOpen ? "success" : "neutral"}>
                  {restaurant.isOpen ? t("open") : t("closed")}
                </Badge>
              </CardContent>
              <CardFooter className="flex-wrap">
                <Link
                  href={`/dashboard/restaurants/${restaurant._id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t("edit")}
                </Link>
                <Link
                  href={`/dashboard/restaurants/${restaurant._id}/menu`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t("manageMenu")}
                </Link>
                <Link
                  href={`/dashboard/restaurants/${restaurant._id}/orders`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t("orderQueue")}
                </Link>
                <Link
                  href={`/dashboard/restaurants/${restaurant._id}/delivery-zones`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t("deliveryZones")}
                </Link>
                <Link
                  href={`/dashboard/restaurants/${restaurant._id}/earnings`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t("earnings")}
                </Link>
                <Link
                  href={`/dashboard/restaurants/${restaurant._id}/sales-report`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t("salesReport")}
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  isLoading={toggling}
                  onClick={() => void toggleOpen(restaurant._id)}
                >
                  {restaurant.isOpen ? t("close") : t("open")}
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
