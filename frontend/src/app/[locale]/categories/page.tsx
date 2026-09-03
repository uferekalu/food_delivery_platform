"use client";

import { Suspense, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Pagination } from "@/components/ui/pagination";
import { RestaurantCard, PlateIcon } from "@/components/restaurant-card";
import { StoreCard, BasketIcon, PillIcon } from "@/components/store-card";
import { useListRestaurantsQuery } from "@/lib/redux/services/restaurants-api";
import { useListStoresQuery } from "@/lib/redux/services/stores-api";
import type { StoreType } from "@/lib/redux/restaurant-types";

function CuisineChips({
  active,
  onChange,
}: {
  active: string | null;
  onChange: (cuisine: string | null) => void;
}) {
  const t = useTranslations("CategoriesPage");
  // A broad, cheap fetch just to build the chip row from real cuisine types on the platform —
  // never a hand-maintained list, and it naturally shrinks/grows as restaurants join.
  const { data } = useListRestaurantsQuery({ limit: 50, sort: "newest" });
  const cuisines = useMemo(
    () => Array.from(new Set((data?.items ?? []).flatMap((r) => r.cuisineTypes))).sort(),
    [data],
  );

  if (cuisines.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
          active === null
            ? "border-primary bg-primary-subtle text-primary-subtle-foreground"
            : "border-border text-text-muted hover:text-text"
        }`}
      >
        {t("all")}
      </button>
      {cuisines.map((cuisine) => (
        <button
          key={cuisine}
          type="button"
          onClick={() => onChange(cuisine)}
          className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
            active === cuisine
              ? "border-primary bg-primary-subtle text-primary-subtle-foreground"
              : "border-border text-text-muted hover:text-text"
          }`}
        >
          {cuisine}
        </button>
      ))}
    </div>
  );
}

function FoodCategory() {
  const t = useTranslations("CategoriesPage");
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useListRestaurantsQuery({
    cuisine: cuisine ?? undefined,
    sort: "rating",
    page,
    limit: 12,
  });

  return (
    <div className="flex flex-col gap-4">
      <CuisineChips
        active={cuisine}
        onChange={(value) => {
          setCuisine(value);
          setPage(1);
        }}
      />

      {isError && <Alert variant="danger">{t("couldNotLoadRestaurants")}</Alert>}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${isFetching ? "opacity-60" : ""}`}>
            {data.items.map((restaurant) => (
              <RestaurantCard key={restaurant._id} restaurant={restaurant} />
            ))}
          </div>
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} className="self-center" />
        </>
      ) : (
        <EmptyState
          icon={<PlateIcon />}
          title={cuisine ? t("noCuisineRestaurantsYet", { cuisine }) : t("noRestaurantsYet")}
          description={cuisine ? t("tryDifferentCuisine") : t("checkBackSoon")}
        />
      )}
    </div>
  );
}

function TagChips({
  storeType,
  active,
  onChange,
}: {
  storeType: StoreType;
  active: string | null;
  onChange: (tag: string | null) => void;
}) {
  const t = useTranslations("CategoriesPage");
  // Same "derive from real data, never a hand-maintained list" reasoning as CuisineChips.
  const { data } = useListStoresQuery({ type: storeType, limit: 50, sort: "newest" });
  const tags = useMemo(
    () => Array.from(new Set((data?.items ?? []).flatMap((s) => s.tags))).sort(),
    [data],
  );

  if (tags.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
          active === null
            ? "border-primary bg-primary-subtle text-primary-subtle-foreground"
            : "border-border text-text-muted hover:text-text"
        }`}
      >
        {t("all")}
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onChange(tag)}
          className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
            active === tag
              ? "border-primary bg-primary-subtle text-primary-subtle-foreground"
              : "border-border text-text-muted hover:text-text"
          }`}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

function StoreTypeCategory({ storeType, icon }: { storeType: StoreType; icon: React.ReactNode }) {
  const t = useTranslations("CategoriesPage");
  const [tag, setTag] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useListStoresQuery({
    type: storeType,
    tag: tag ?? undefined,
    sort: "rating",
    page,
    limit: 12,
  });

  return (
    <div className="flex flex-col gap-4">
      <TagChips
        storeType={storeType}
        active={tag}
        onChange={(value) => {
          setTag(value);
          setPage(1);
        }}
      />

      {isError && <Alert variant="danger">{t("couldNotLoadStores")}</Alert>}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${isFetching ? "opacity-60" : ""}`}>
            {data.items.map((store) => (
              <StoreCard key={store._id} store={store} />
            ))}
          </div>
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} className="self-center" />
        </>
      ) : (
        <EmptyState
          icon={icon}
          title={tag ? t("noTagStoresYet", { tag }) : t("noStoresYet")}
          description={tag ? t("tryDifferentTag") : t("checkBackSoon")}
        />
      )}
    </div>
  );
}

const VALID_TABS = new Set(["food", "groceries", "pharmacy"]);

/**
 * `useSearchParams()` opts the tree above it out of static prerendering unless wrapped in
 * `Suspense` — see the same pattern in app/(auth)/register/page.tsx.
 */
export default function CategoriesPage() {
  return (
    <Suspense fallback={<CategoriesPageSkeleton />}>
      <CategoriesContent />
    </Suspense>
  );
}

function CategoriesPageSkeleton() {
  return (
    <Container className="flex flex-col gap-6 py-10">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </Container>
  );
}

function CategoriesContent() {
  const t = useTranslations("CategoriesPage");
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState(initialTab && VALID_TABS.has(initialTab) ? initialTab : "food");

  return (
    <Container className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-text">{t("categories")}</h1>
        <p className="text-text-muted">{t("everythingInOnePlace")}</p>
      </div>

      <Tabs value={tab} onChange={setTab}>
        <TabList>
          <Tab value="food">{t("food")}</Tab>
          <Tab value="groceries">{t("groceries")}</Tab>
          <Tab value="pharmacy">{t("pharmacyAndMore")}</Tab>
        </TabList>
        <TabPanel value="food">
          <FoodCategory />
        </TabPanel>
        <TabPanel value="groceries">
          <StoreTypeCategory storeType="groceries" icon={<BasketIcon />} />
        </TabPanel>
        <TabPanel value="pharmacy">
          <StoreTypeCategory storeType="pharmacy_beauty" icon={<PillIcon />} />
        </TabPanel>
      </Tabs>
    </Container>
  );
}
