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
import { useGetMyStoresQuery, useToggleStoreOpenMutation } from "@/lib/redux/services/stores-api";

function MyStoresList() {
  const t = useTranslations("DashboardStoresPage");
  const tType = useTranslations("StoreForm");
  const { data, isLoading } = useGetMyStoresQuery();
  const [toggleOpen, { isLoading: toggling }] = useToggleStoreOpenMutation();

  return (
    <Container className="flex flex-col gap-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">{t("myStores")}</h1>
        <Link href="/dashboard/stores/new" className={buttonVariants({ variant: "primary" })}>
          {t("addStore")}
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-subtle p-4">
        <p className="text-sm text-text">{t("alsoRunARestaurant")}</p>
        <Link href="/dashboard/restaurants/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("addRestaurant")}
        </Link>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title={t("noStoresYet")}
          description={t("createFirstStore")}
          action={
            <Link href="/dashboard/stores/new" className={buttonVariants({ variant: "primary", size: "sm" })}>
              {t("addStore")}
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.map((store) => (
            <Card key={store._id}>
              <CardHeader>
                <CardTitle>{store.name}</CardTitle>
                <CardDescription>
                  {store.type === "groceries" ? tType("groceries") : tType("pharmacyBeauty")}
                  {store.tags.length > 0 ? ` · ${store.tags.join(", ")}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant={store.isApproved ? "success" : "warning"}>
                  {store.isApproved ? t("approved") : t("pendingApproval")}
                </Badge>
                <Badge variant={store.isOpen ? "success" : "neutral"}>{store.isOpen ? t("open") : t("closed")}</Badge>
              </CardContent>
              <CardFooter className="flex-wrap">
                <Link href={`/dashboard/stores/${store._id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  {t("edit")}
                </Link>
                <Link
                  href={`/dashboard/stores/${store._id}/catalog`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t("manageCatalog")}
                </Link>
                <Link
                  href={`/dashboard/stores/${store._id}/orders`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t("orderQueue")}
                </Link>
                <Link
                  href={`/dashboard/stores/${store._id}/delivery-zones`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t("deliveryZones")}
                </Link>
                <Button variant="ghost" size="sm" isLoading={toggling} onClick={() => void toggleOpen(store._id)}>
                  {store.isOpen ? t("close") : t("open")}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </Container>
  );
}

export default function DashboardStoresPage() {
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <MyStoresList />
    </RequireRole>
  );
}
