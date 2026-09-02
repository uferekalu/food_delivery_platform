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
import { useListRestaurantsQuery } from "@/lib/redux/services/restaurants-api";

function BasketIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-10">
      <path d="M6 12h20l-2 14H8L6 12z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11 12V9a5 5 0 0110 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PillIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-10">
      <rect x="6" y="13" width="20" height="9" rx="4.5" stroke="currentColor" strokeWidth="1.5" transform="rotate(-30 16 17.5)" />
      <path d="M16 12.5l3 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

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

function ComingSoonCategory({ icon, name }: { icon: React.ReactNode; name: string }) {
  const t = useTranslations("CategoriesPage");
  return (
    <EmptyState
      icon={icon}
      title={t("categoryComingSoon", { name })}
      description={t("focusedOnRestaurantsFirst")}
      className="py-20"
    />
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
          <ComingSoonCategory icon={<BasketIcon />} name={t("groceries")} />
        </TabPanel>
        <TabPanel value="pharmacy">
          <ComingSoonCategory icon={<PillIcon />} name={t("pharmacy")} />
        </TabPanel>
      </Tabs>
    </Container>
  );
}
