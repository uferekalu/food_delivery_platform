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
import { InlineDiscountBadge } from "@/components/inline-discount-badge";
import { CategoryNav } from "@/components/category-nav";
import { BasketIcon, PillIcon } from "@/components/store-card";
import { useGetStoreBySlugQuery } from "@/lib/redux/services/stores-api";
import { useGetStoreCatalogQuery } from "@/lib/redux/services/store-catalog-api";
import { useAddStoreItemMutation } from "@/lib/redux/services/cart-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { Product, ProductCategory } from "@/lib/redux/restaurant-types";
import { describeOpenStatus, getOpenStatus } from "@/lib/opening-hours";
import { formatMoney } from "@/lib/currency";
import type { ReactNode } from "react";

function isConflictError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: unknown }).status === 409;
}

function StarIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M10 1.5l2.62 5.31 5.86.85-4.24 4.13 1 5.84L10 14.9l-5.24 2.75 1-5.84L1.52 7.66l5.86-.85L10 1.5z" />
    </svg>
  );
}

function ClockIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** See the identical component on the restaurant detail page — same "at a glance" stat pill
 * treatment (docs/ROADMAP.md FDP-131), kept as two small copies rather than one shared import
 * since store/restaurant have genuinely different stat sets (no price level here). */
function StatChip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text">
      {icon && <span className="text-text-muted">{icon}</span>}
      {children}
    </span>
  );
}

function ProductCard({ product, currency, storeIsOpen }: { product: Product; currency: string; storeIsOpen: boolean }) {
  const t = useTranslations("StoreDetailPage");
  const locale = useLocale();
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
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border transition-shadow duration-150 hover:border-border-strong hover:shadow-md">
      {product.imageUrl && (
        // A product photo doesn't warrant next/image's layout machinery here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.imageUrl} alt="" className="h-24 w-full object-cover sm:h-28" />
      )}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-col gap-0.5">
          <span className="line-clamp-2 text-sm font-medium text-text">
            {product.name}
            {product.unit ? <span className="text-text-muted"> · {product.unit}</span> : null}
          </span>
          {product.description && (
            <span className="line-clamp-1 text-xs text-text-muted">{product.description}</span>
          )}
        </div>
        {product.discountedPrice != null ? (
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-sm font-semibold text-danger">
              {formatMoney(product.discountedPrice, currency, locale)}
            </span>
            <span className="text-xs text-text-muted line-through">
              {formatMoney(product.price, currency, locale)}
            </span>
          </div>
        ) : (
          <span className="text-sm font-semibold text-text">{formatMoney(product.price, currency, locale)}</span>
        )}
        {storeIsOpen && (
          <Button
            variant="outline"
            size="sm"
            className="mt-auto w-full"
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
    // Only the top-level section gets the scroll-anchor id — CategoryNav's jump list is built
    // from top-level categories only, matching the reference (docs/ROADMAP.md FDP-131): a nested
    // subcategory still renders inline under its parent, it just isn't its own nav entry.
    <div
      id={level === 0 ? `category-${category._id}` : undefined}
      className={level === 0 ? "flex scroll-mt-40 flex-col gap-3 sm:scroll-mt-24" : "flex flex-col gap-3"}
    >
      <Heading className={level === 0 ? "text-xl font-semibold text-text" : "text-lg font-semibold text-text"}>
        {category.name}
      </Heading>
      {ownProducts.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
        <Skeleton className="h-56 w-full" />
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
  const navCategories = topLevelCategories.map((c) => ({ id: c._id, name: c.name }));
  const scheduleStatus = getOpenStatus(store.openingHours, store.country);
  // Deliberately schedule-aware, not just the manual toggle — see the identical note on the
  // restaurant detail page (docs/ROADMAP.md FDP-84): an owner can forget to flip isOpen, so
  // ordering availability follows the actual weekly hours whenever a schedule is set.
  const { label: openLabel, isOpenNow } = describeOpenStatus(store.isOpen, scheduleStatus, locale, t);
  const fallbackIcon = store.type === "groceries" ? <BasketIcon className="size-16" /> : <PillIcon className="size-16" />;

  return (
    <Container className="flex flex-col gap-6 py-10">
      <Breadcrumbs items={[{ label: t("browseHome"), href: "/categories" }, { label: store.name }]} />

      {/* Hero cover banner (docs/ROADMAP.md FDP-131) — see the restaurant detail page's identical
          section for the full reasoning (coverUrl/logoUrl already existed end-to-end, just never
          rendered here). */}
      <div className="relative h-48 w-full overflow-hidden rounded-xl bg-secondary sm:h-64 lg:h-72">
        {store.coverUrl ? (
          // A store cover photo doesn't warrant next/image's layout machinery here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-muted">{fallbackIcon}</div>
        )}
        {store.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={store.logoUrl}
            alt=""
            className="absolute -bottom-8 left-4 size-16 rounded-full border-4 border-surface object-cover shadow-md sm:size-20"
          />
        )}
      </div>

      <div className={`flex flex-col gap-3 ${store.logoUrl ? "pt-8 sm:pt-10" : ""}`}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-text">{store.name}</h1>
          {store.isSponsored && <Badge variant="warning">{t("sponsored")}</Badge>}
          <Badge variant={isOpenNow ? "success" : "neutral"}>{openLabel}</Badge>
        </div>

        {store.tags.length > 0 && <p className="text-text-muted">{store.tags.join(", ")}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <StatChip icon={<StarIcon />}>
            {store.avgRating.toFixed(1)} ({t("reviewCount", { count: store.reviewCount })})
          </StatChip>
          {store.estimatedDeliveryMinutes && (
            <StatChip icon={<ClockIcon />}>{t("estimatedMinutes", { minutes: store.estimatedDeliveryMinutes })}</StatChip>
          )}
        </div>

        <InlineDiscountBadge storeId={store._id} currency={store.currency} />

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

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <CategoryNav categories={navCategories} />

        {/* Desktop: the sidebar stays static (sticky, pinned) while this pane scrolls
            independently within its own bounded height — see the identical note on the
            restaurant detail page (docs/ROADMAP.md FDP-131 follow-up). Mobile unaffected. */}
        <div className="flex min-w-0 flex-1 flex-col gap-8 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-2">
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
      </div>
    </Container>
  );
}
