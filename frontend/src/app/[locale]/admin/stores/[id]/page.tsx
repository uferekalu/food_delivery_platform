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
import { useApproveStoreMutation, useGetStoreByIdForAdminQuery } from "@/lib/redux/services/stores-api";
import { useGetStoreCatalogQuery } from "@/lib/redux/services/store-catalog-api";
import { getErrorMessage } from "@/lib/redux/error";
import { formatMoney } from "@/lib/currency";
import type { Product } from "@/lib/redux/restaurant-types";

function AdminStoreReview({ id }: { id: string }) {
  const t = useTranslations("AdminStoreReviewPage");
  const locale = useLocale();
  const DAY_LABELS = [t("sunday"), t("monday"), t("tuesday"), t("wednesday"), t("thursday"), t("friday"), t("saturday")];
  const router = useRouter();
  const { toast } = useToast();
  const { data: store, isLoading: loadingStore, isError } = useGetStoreByIdForAdminQuery(id);
  const { data: catalog, isLoading: loadingCatalog } = useGetStoreCatalogQuery(id);
  const [approve, { isLoading: approving }] = useApproveStoreMutation();

  const productCount = catalog?.products.length ?? 0;
  const hasComplianceDocument = !!store?.complianceDocumentUrl;
  // Mirrors the backend's own approval gate (docs/ROADMAP.md FDP-56: StoresService.approve +
  // AdminService.approveStore) — disabled here purely for immediate feedback; the server-side
  // check is the one that actually matters and can't be bypassed from the client.
  const canApprove = !loadingCatalog && hasComplianceDocument && productCount > 0;

  if (loadingStore) {
    return (
      <Container className="flex flex-col gap-4 py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </Container>
    );
  }

  if (isError || !store) {
    return (
      <Container className="py-10">
        <EmptyState title={t("storeNotFound")} description={t("mayHaveBeenRemoved")} />
      </Container>
    );
  }

  const categoriesById = new Map((catalog?.categories ?? []).map((c) => [c._id, c]));
  const productsByCategory = new Map<string, Product[]>();
  for (const product of catalog?.products ?? []) {
    const list = productsByCategory.get(product.categoryId) ?? [];
    list.push(product);
    productsByCategory.set(product.categoryId, list);
  }

  return (
    <Container className="flex flex-col gap-6 py-10">
      <Breadcrumbs
        items={[{ label: t("admin"), href: "/admin" }, { label: t("stores"), href: "/admin" }, { label: store.name }]}
      />

      {!store.isApproved && (
        <Alert variant="warning" title={t("awaitingApproval")}>
          {t("notVisibleToCustomersYet")}
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-text">{store.name}</h1>
          <Badge variant={store.isApproved ? "success" : "warning"}>
            {store.isApproved ? t("approved") : t("pendingApproval")}
          </Badge>
        </div>
        <p className="text-text-muted">
          {store.type === "groceries" ? t("groceries") : t("pharmacyBeauty")}
          {store.tags.length > 0 ? ` · ${store.tags.join(", ")}` : ""} • {store.currency}
          {store.estimatedDeliveryMinutes ? ` • ${t("estimatedMinutes", { minutes: store.estimatedDeliveryMinutes })}` : ""}
        </p>
        {store.description && <p className="max-w-2xl text-text">{store.description}</p>}
        <p className="text-sm text-text-muted">
          {store.address.line1}
          {store.address.line2 ? `, ${store.address.line2}` : ""}, {store.address.city}, {store.address.state},{" "}
          {store.country}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <span className="text-sm font-semibold text-text">{t("logo")}</span>
          {store.logoUrl ? (
            // A one-off admin review page doesn't warrant next/image's layout machinery.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt="" className="h-24 w-24 rounded-md object-cover" />
          ) : (
            <span className="text-sm text-text-muted">{t("notSet")}</span>
          )}
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <span className="text-sm font-semibold text-text">{t("coverPhoto")}</span>
          {store.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.coverUrl} alt="" className="h-24 w-full rounded-md object-cover" />
          ) : (
            <span className="text-sm text-text-muted">{t("notSet")}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <span className="text-sm font-semibold text-text">{t("businessRegistrationDocument")}</span>
        {store.complianceDocumentUrl ? (
          <a
            href={store.complianceDocumentUrl}
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
          {store.openingHours.length === 0 ? (
            <span className="text-sm text-text-muted">{t("notSet")}</span>
          ) : (
            store.openingHours.map((hour) => (
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
            {t("catalog")} {!loadingCatalog && t("productCount", { count: productCount })}
          </h2>
        </div>
        {loadingCatalog ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !catalog || productCount === 0 ? (
          <Alert variant="warning" title={t("noProducts")}>
            {t("noProductsDescription")}
          </Alert>
        ) : (
          [...categoriesById.values()]
            .filter((category) => (productsByCategory.get(category._id) ?? []).length > 0)
            .map((category) => (
              <div key={category._id} className="flex flex-col gap-3">
                <h3 className="text-lg font-semibold text-text">{category.name}</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(productsByCategory.get(category._id) ?? []).map((product) => (
                    <div key={product._id} className="flex flex-col gap-2 overflow-hidden rounded-lg border border-border">
                      {product.imageUrl && (
                        // A catalog-review thumbnail doesn't warrant next/image's layout machinery.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.imageUrl} alt="" className="h-32 w-full object-cover" />
                      )}
                      <div className="flex flex-col gap-2 p-4 pt-2 first:pt-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-text">{product.name}</span>
                            {product.description && (
                              <span className="text-sm text-text-muted">{product.description}</span>
                            )}
                          </div>
                          <span className="shrink-0 font-semibold text-text">
                            {formatMoney(product.price, store.currency, locale)}
                          </span>
                        </div>
                        {!product.isAvailable && <Badge variant="neutral">{t("unavailable")}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        {!store.isApproved && !canApprove && !loadingCatalog && (
          <Alert variant="warning" title={t("cantApproveYet")}>
            {!hasComplianceDocument && productCount === 0
              ? t("needsDocumentAndProduct")
              : !hasComplianceDocument
                ? t("needsDocument")
                : t("needsProduct")}
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          {store.isApproved ? (
            <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
              {t("backToAdminDashboard")}
            </Link>
          ) : (
            <Button
              isLoading={approving}
              disabled={!canApprove}
              onClick={() =>
                void approve(store._id)
                  .unwrap()
                  .then(() => {
                    toast({ title: t("storeApproved"), variant: "success" });
                    router.push("/admin");
                  })
                  .catch((err: unknown) =>
                    toast({ title: t("couldNotApproveStore"), description: getErrorMessage(err), variant: "danger" }),
                  )
              }
            >
              {t("approveStore")}
            </Button>
          )}
        </div>
      </div>
    </Container>
  );
}

export default function AdminStoreReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole roles={["admin"]}>
      <AdminStoreReview id={id} />
    </RequireRole>
  );
}
