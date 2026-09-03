"use client";

import { use, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useGetStoreBySlugQuery } from "@/lib/redux/services/stores-api";
import { useGetStoreCatalogQuery } from "@/lib/redux/services/store-catalog-api";
import { useAddStoreItemMutation } from "@/lib/redux/services/cart-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { Product, ProductCategory } from "@/lib/redux/restaurant-types";
import { describeOpenStatus, getOpenStatus } from "@/lib/opening-hours";

function isConflictError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: unknown }).status === 409;
}

function ProductCard({ product, currency, storeIsOpen }: { product: Product; currency: string; storeIsOpen: boolean }) {
  const t = useTranslations("StoreDetailPage");
  const { toast } = useToast();
  const [addStoreItem, { isLoading }] = useAddStoreItemMutation();
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const outOfStock = product.stockQuantity != null && product.stockQuantity <= 0;

  async function add(replace = false) {
    try {
      await addStoreItem({ productId: product._id, qty: 1, replace }).unwrap();
      setConfirmingReplace(false);
      toast({ title: t("addedToCart"), variant: "success" });
    } catch (err) {
      if (isConflictError(err)) {
        setConfirmingReplace(true);
        return;
      }
      toast({ title: t("couldNotAddToCart"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <div className="flex flex-col gap-3 overflow-hidden rounded-lg border border-border">
      {product.imageUrl && (
        // A product photo doesn't warrant next/image's layout machinery here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.imageUrl} alt="" className="h-40 w-full object-cover" />
      )}
      <div className="flex flex-col gap-3 p-4 pt-0 first:pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-text">
              {product.name}
              {product.unit ? <span className="text-text-muted"> · {product.unit}</span> : null}
            </span>
            {product.description && <span className="text-sm text-text-muted">{product.description}</span>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {product.discountedPrice != null ? (
              <>
                <span className="text-xs text-text-muted line-through">
                  {currency} {product.price.toFixed(2)}
                </span>
                <span className="font-semibold text-danger">
                  {currency} {product.discountedPrice.toFixed(2)}
                </span>
              </>
            ) : (
              <span className="font-semibold text-text">
                {currency} {product.price.toFixed(2)}
              </span>
            )}
          </div>
        </div>
        {storeIsOpen && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={!product.isAvailable || outOfStock}
            isLoading={isLoading}
            onClick={() => void add()}
          >
            {outOfStock ? t("outOfStock") : t("addToCart")}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmingReplace}
        onClose={() => setConfirmingReplace(false)}
        onConfirm={() => void add(true)}
        title={t("startNewCartTitle")}
        description={t("startNewCartDescription")}
        confirmLabel={t("clearCartAndAdd")}
        isLoading={isLoading}
      />
    </div>
  );
}

function CategorySection({
  category,
  categories,
  products,
  currency,
  storeIsOpen,
  level = 0,
}: {
  category: ProductCategory;
  categories: ProductCategory[];
  products: Product[];
  currency: string;
  storeIsOpen: boolean;
  level?: number;
}) {
  const children = categories.filter((c) => c.parentCategoryId === category._id);
  const ownProducts = products.filter((p) => p.categoryId === category._id && p.isAvailable);
  const Heading = level === 0 ? "h2" : "h3";

  if (ownProducts.length === 0 && children.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <Heading className={level === 0 ? "text-xl font-semibold text-text" : "text-lg font-semibold text-text"}>
        {category.name}
      </Heading>
      {ownProducts.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ownProducts.map((product) => (
            <ProductCard key={product._id} product={product} currency={currency} storeIsOpen={storeIsOpen} />
          ))}
        </div>
      )}
      {children.map((child) => (
        <CategorySection
          key={child._id}
          category={child}
          categories={categories}
          products={products}
          currency={currency}
          storeIsOpen={storeIsOpen}
          level={level + 1}
        />
      ))}
    </div>
  );
}

export default function StoreDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = useTranslations("StoreDetailPage");
  const locale = useLocale();
  const { slug } = use(params);
  const { data: store, isLoading: loadingStore, isError } = useGetStoreBySlugQuery(slug);
  const { data: catalog, isLoading: loadingCatalog } = useGetStoreCatalogQuery(store?._id ?? "", {
    skip: !store,
  });

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
        <EmptyState title={t("storeNotFound")} description={t("unavailableOrIncorrectLink")} />
      </Container>
    );
  }

  const topLevelCategories = catalog?.categories.filter((c) => c.parentCategoryId === null) ?? [];
  const scheduleStatus = getOpenStatus(store.openingHours, store.country);
  const { label: openLabel, isOpenNow } = describeOpenStatus(store.isOpen, scheduleStatus, locale, t);

  return (
    <Container className="flex flex-col gap-6 py-10">
      <Breadcrumbs items={[{ label: t("browseHome"), href: "/categories" }, { label: store.name }]} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-text">{store.name}</h1>
          <Badge variant={isOpenNow ? "success" : "neutral"}>{openLabel}</Badge>
        </div>
        <p className="text-text-muted">
          ⭐ {store.avgRating.toFixed(1)} ({t("reviewCount", { count: store.reviewCount })})
          {store.estimatedDeliveryMinutes ? ` • ${t("estimatedMinutes", { minutes: store.estimatedDeliveryMinutes })}` : ""}
        </p>
        {store.description && <p className="max-w-2xl text-text">{store.description}</p>}
        <p className="text-sm text-text-muted">
          {store.address.line1}, {store.address.city}, {store.address.state}
        </p>
      </div>

      {!isOpenNow && (
        <Alert variant="warning" title={t("currentlyClosed")}>
          {t("notAcceptingOrders")}
        </Alert>
      )}

      <div className="flex flex-col gap-8">
        <h2 className="text-xl font-semibold text-text">{t("catalog")}</h2>
        {loadingCatalog ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !catalog || topLevelCategories.length === 0 ? (
          <EmptyState title={t("catalogComingSoon")} description={t("catalogNotPublished")} />
        ) : (
          topLevelCategories.map((category) => (
            <CategorySection
              key={category._id}
              category={category}
              categories={catalog.categories}
              products={catalog.products}
              currency={store.currency}
              storeIsOpen={isOpenNow}
            />
          ))
        )}
      </div>
    </Container>
  );
}
