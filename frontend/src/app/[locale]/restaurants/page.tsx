"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Alert } from "@/components/ui/alert";
import { RestaurantCard, PlateIcon } from "@/components/restaurant-card";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useListRestaurantsQuery } from "@/lib/redux/services/restaurants-api";
import type { RestaurantSort } from "@/lib/redux/restaurant-types";

export default function RestaurantsPage() {
  return (
    <Suspense fallback={<Container className="py-10" />}>
      <RestaurantsPageContent />
    </Suspense>
  );
}

function RestaurantsPageContent() {
  const t = useTranslations("RestaurantsPage");
  const SORT_OPTIONS: SelectOption[] = [
    { value: "newest", label: t("newest") },
    { value: "rating", label: t("highestRated") },
    { value: "price_asc", label: t("priceLowToHigh") },
    { value: "price_desc", label: t("priceHighToLow") },
    { value: "delivery_time", label: t("fastestDelivery") },
  ];

  const RATING_OPTIONS: SelectOption[] = [
    { value: "", label: t("anyRating") },
    { value: "3", label: t("starsAndUp", { count: 3 }) },
    { value: "4", label: t("starsAndUp", { count: 4 }) },
    { value: "4.5", label: t("starsAndUp", { count: 4.5 }) },
  ];

  const PRICE_OPTIONS: SelectOption[] = [
    { value: "", label: t("anyPrice") },
    { value: "1", label: "$" },
    { value: "2", label: t("andUnder", { price: "$$" }) },
    { value: "3", label: t("andUnder", { price: "$$$" }) },
    { value: "4", label: t("andUnder", { price: "$$$$" }) },
  ];

  const DELIVERY_TIME_OPTIONS: SelectOption[] = [
    { value: "", label: t("anyDeliveryTime") },
    { value: "30", label: t("under30Min") },
    { value: "45", label: t("under45Min") },
    { value: "60", label: t("under60Min") },
  ];

  const searchParams = useSearchParams();
  // Only used as the initial value — the header's search (see header-search.tsx) always
  // navigates here with `?search=`, but this page owns its own debounced state afterward so
  // typing in the on-page search box doesn't fight the URL for control.
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");
  const search = useDebouncedValue(searchInput, 350);
  const [minRating, setMinRating] = useState("");
  const [maxPriceLevel, setMaxPriceLevel] = useState("");
  const [maxDeliveryMinutes, setMaxDeliveryMinutes] = useState("");
  const [sort, setSort] = useState<RestaurantSort>("newest");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError } = useListRestaurantsQuery({
    search: search || undefined,
    minRating: minRating ? Number(minRating) : undefined,
    maxPriceLevel: maxPriceLevel ? Number(maxPriceLevel) : undefined,
    maxDeliveryMinutes: maxDeliveryMinutes ? Number(maxDeliveryMinutes) : undefined,
    sort,
    page,
    limit: 10,
  });

  function resetToFirstPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const hasActiveFilters = Boolean(search || minRating || maxPriceLevel || maxDeliveryMinutes);
  // Once we know the platform has zero restaurants at all (not just zero matches for the
  // current search/filters), the search box and filter dropdowns have nothing to act on —
  // showing them next to "no restaurants found" reads as broken, not just empty. Keep them
  // visible during the initial load (we don't know which case it is yet) and whenever a
  // search/filter actually produced the empty result, so clearing it is still possible.
  const platformIsEmpty = !isLoading && !isError && data?.total === 0 && !hasActiveFilters;

  return (
    <Container className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-text">{t("restaurants")}</h1>
        <p className="text-text-muted">{t("orderFromNearYou")}</p>
      </div>

      {!platformIsEmpty && (
        <div className="flex flex-col gap-3">
          <Input
            type="search"
            placeholder={t("searchRestaurants")}
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            className="max-w-sm"
            aria-label={t("searchRestaurants")}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:max-w-2xl">
            <Select
              aria-label={t("minimumRating")}
              options={RATING_OPTIONS}
              value={minRating}
              onChange={resetToFirstPage(setMinRating)}
            />
            <Select
              aria-label={t("maximumPrice")}
              options={PRICE_OPTIONS}
              value={maxPriceLevel}
              onChange={resetToFirstPage(setMaxPriceLevel)}
            />
            <Select
              aria-label={t("maximumDeliveryTime")}
              options={DELIVERY_TIME_OPTIONS}
              value={maxDeliveryMinutes}
              onChange={resetToFirstPage(setMaxDeliveryMinutes)}
            />
            <Select
              aria-label={t("sortBy")}
              options={SORT_OPTIONS}
              value={sort}
              onChange={resetToFirstPage((v: string) => setSort(v as RestaurantSort))}
            />
          </div>
        </div>
      )}

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
      ) : platformIsEmpty ? (
        <EmptyState
          icon={<PlateIcon />}
          title={t("noRestaurantsYet")}
          description={t("justGettingStarted")}
          className="py-20"
        />
      ) : (
        <EmptyState title={t("noRestaurantsFound")} description={t("tryDifferentSearch")} />
      )}
    </Container>
  );
}
