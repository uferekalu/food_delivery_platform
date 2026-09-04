"use client";

import { use } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useToast } from "@/components/ui/toast";
import {
  useApproveRestaurantMutation,
  useGetRestaurantByIdForAdminQuery,
} from "@/lib/redux/services/restaurants-api";
import { useGetMenuQuery } from "@/lib/redux/services/menu-api";
import { getErrorMessage } from "@/lib/redux/error";
import { formatMoney } from "@/lib/currency";

function AdminRestaurantReview({ id }: { id: string }) {
  const t = useTranslations("AdminRestaurantReviewPage");
  const locale = useLocale();
  const DAY_LABELS = [t("sunday"), t("monday"), t("tuesday"), t("wednesday"), t("thursday"), t("friday"), t("saturday")];
  const router = useRouter();
  const { toast } = useToast();
  const { data: restaurant, isLoading: loadingRestaurant, isError } = useGetRestaurantByIdForAdminQuery(id);
  const { data: menu, isLoading: loadingMenu } = useGetMenuQuery(id);
  const [approve, { isLoading: approving }] = useApproveRestaurantMutation();

  const itemCount = menu?.reduce((total, category) => total + category.items.length, 0) ?? 0;
  const hasComplianceDocument = !!restaurant?.complianceDocumentUrl;
  // Mirrors the backend's own approval gate (docs/ROADMAP.md FDP-60: RestaurantsService.approve
  // + AdminService.approveRestaurant) — disabled here purely for immediate feedback; the
  // server-side check is the one that actually matters and can't be bypassed from the client.
  const canApprove = !loadingMenu && hasComplianceDocument && itemCount > 0;

  if (loadingRestaurant) {
    return (
      <Container className="flex flex-col gap-4 py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </Container>
    );
  }

  if (isError || !restaurant) {
    return (
      <Container className="py-10">
        <EmptyState title={t("restaurantNotFound")} description={t("mayHaveBeenRemoved")} />
      </Container>
    );
  }

  return (
    <Container className="flex flex-col gap-6 py-10">
      <Breadcrumbs
        items={[
          { label: t("admin"), href: "/admin" },
          { label: t("restaurants"), href: "/admin" },
          { label: restaurant.name },
        ]}
      />

      {!restaurant.isApproved && (
        <Alert variant="warning" title={t("awaitingApproval")}>
          {t("notVisibleToCustomersYet")}
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-text">{restaurant.name}</h1>
          <Badge variant={restaurant.isApproved ? "success" : "warning"}>
            {restaurant.isApproved ? t("approved") : t("pendingApproval")}
          </Badge>
        </div>
        <p className="text-text-muted">
          {restaurant.cuisineTypes.join(", ") || t("noCuisineTypesListed")} • {restaurant.currency} •{" "}
          {"$".repeat(restaurant.priceLevel)}
          {restaurant.estimatedDeliveryMinutes ? ` • ${t("estimatedMinutes", { minutes: restaurant.estimatedDeliveryMinutes })}` : ""}
        </p>
        {restaurant.description && <p className="max-w-2xl text-text">{restaurant.description}</p>}
        <p className="text-sm text-text-muted">
          {restaurant.address.line1}
          {restaurant.address.line2 ? `, ${restaurant.address.line2}` : ""}, {restaurant.address.city},{" "}
          {restaurant.address.state}, {restaurant.country}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <span className="text-sm font-semibold text-text">{t("logo")}</span>
          {restaurant.logoUrl ? (
            // A one-off admin review page doesn't warrant next/image's layout machinery.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.logoUrl} alt="" className="h-24 w-24 rounded-md object-cover" />
          ) : (
            <span className="text-sm text-text-muted">{t("notSet")}</span>
          )}
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <span className="text-sm font-semibold text-text">{t("coverPhoto")}</span>
          {restaurant.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.coverUrl} alt="" className="h-24 w-full rounded-md object-cover" />
          ) : (
            <span className="text-sm text-text-muted">{t("notSet")}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <span className="text-sm font-semibold text-text">{t("businessRegistrationDocument")}</span>
        {restaurant.complianceDocumentUrl ? (
          <a
            href={restaurant.complianceDocumentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit text-sm text-primary hover:underline"
          >
            {t("viewUploadedDocument")}
          </a>
        ) : (
          <span className="text-sm text-danger">{t("notUploadedRequired")}</span>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <span className="text-sm font-semibold text-text">{t("openingHours")}</span>
        <div className="flex flex-col gap-1">
          {restaurant.openingHours.length === 0 ? (
            <span className="text-sm text-text-muted">{t("notSet")}</span>
          ) : (
            restaurant.openingHours.map((hour) => (
              <div key={hour.dayOfWeek} className="flex gap-3 text-sm text-text-muted">
                <span className="w-24 shrink-0 text-text">{DAY_LABELS[hour.dayOfWeek]}</span>
                <span>{hour.isClosed ? t("closed") : `${hour.openTime} – ${hour.closeTime}`}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-text">
            {t("menu")} {!loadingMenu && t("itemCount", { count: itemCount })}
          </h2>
        </div>
        {loadingMenu ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !menu || itemCount === 0 ? (
          <Alert variant="warning" title={t("noMenuItems")}>
            {t("noMenuItemsDescription")}
          </Alert>
        ) : (
          menu
            .filter((category) => category.items.length > 0)
            .map((category) => (
              <div key={category._id} className="flex flex-col gap-3">
                <h3 className="text-lg font-semibold text-text">{category.name}</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {category.items.map((item) => (
                    <div key={item._id} className="flex flex-col gap-2 overflow-hidden rounded-lg border border-border">
                      {item.imageUrl && (
                        // A menu-review thumbnail doesn't warrant next/image's layout machinery.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt="" className="h-32 w-full object-cover" />
                      )}
                      <div className="flex flex-col gap-2 p-4 pt-2 first:pt-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-text">{item.name}</span>
                            {item.description && <span className="text-sm text-text-muted">{item.description}</span>}
                          </div>
                          <span className="shrink-0 font-semibold text-text">
                            {formatMoney(item.price, restaurant.currency, locale)}
                          </span>
                        </div>
                        {!item.isAvailable && <Badge variant="neutral">{t("unavailable")}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        {!restaurant.isApproved && !canApprove && !loadingMenu && (
          <Alert variant="warning" title={t("cantApproveYet")}>
            {!hasComplianceDocument && itemCount === 0
              ? t("needsDocumentAndMenuItem")
              : !hasComplianceDocument
                ? t("needsDocument")
                : t("needsMenuItem")}
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          {restaurant.isApproved ? (
            <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
              {t("backToAdminDashboard")}
            </Link>
          ) : (
            <Button
              isLoading={approving}
              disabled={!canApprove}
              onClick={() =>
                void approve(restaurant._id)
                  .unwrap()
                  .then(() => {
                    toast({ title: t("restaurantApproved"), variant: "success" });
                    router.push("/admin");
                  })
                  .catch((err: unknown) =>
                    toast({ title: t("couldNotApproveRestaurant"), description: getErrorMessage(err), variant: "danger" }),
                  )
              }
            >
              {t("approveRestaurant")}
            </Button>
          )}
        </div>
      </div>
    </Container>
  );
}

export default function AdminRestaurantReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole roles={["admin"]}>
      <AdminRestaurantReview id={id} />
    </RequireRole>
  );
}
