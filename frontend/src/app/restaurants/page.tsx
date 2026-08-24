"use client";

import { useState } from "react";
import NextLink from "next/link";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Alert } from "@/components/ui/alert";
import { FavoriteButton } from "@/components/favorite-button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useListRestaurantsQuery } from "@/lib/redux/services/restaurants-api";
import type { RestaurantSort } from "@/lib/redux/restaurant-types";

const SORT_OPTIONS: SelectOption[] = [
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Highest rated" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "delivery_time", label: "Fastest delivery" },
];

const RATING_OPTIONS: SelectOption[] = [
  { value: "", label: "Any rating" },
  { value: "3", label: "3+ stars" },
  { value: "4", label: "4+ stars" },
  { value: "4.5", label: "4.5+ stars" },
];

const PRICE_OPTIONS: SelectOption[] = [
  { value: "", label: "Any price" },
  { value: "1", label: "$" },
  { value: "2", label: "$$ and under" },
  { value: "3", label: "$$$ and under" },
  { value: "4", label: "$$$$ and under" },
];

const DELIVERY_TIME_OPTIONS: SelectOption[] = [
  { value: "", label: "Any delivery time" },
  { value: "30", label: "Under 30 min" },
  { value: "45", label: "Under 45 min" },
  { value: "60", label: "Under 60 min" },
];

function priceLevelLabel(level: number): string {
  return "$".repeat(level);
}

export default function RestaurantsPage() {
  const [searchInput, setSearchInput] = useState("");
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

  return (
    <Container className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-text">Restaurants</h1>
        <p className="text-text-muted">Order from restaurants near you.</p>
      </div>

      <div className="flex flex-col gap-3">
        <Input
          type="search"
          placeholder="Search restaurants…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
          aria-label="Search restaurants"
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:max-w-2xl">
          <Select
            aria-label="Minimum rating"
            options={RATING_OPTIONS}
            value={minRating}
            onChange={resetToFirstPage(setMinRating)}
          />
          <Select
            aria-label="Maximum price"
            options={PRICE_OPTIONS}
            value={maxPriceLevel}
            onChange={resetToFirstPage(setMaxPriceLevel)}
          />
          <Select
            aria-label="Maximum delivery time"
            options={DELIVERY_TIME_OPTIONS}
            value={maxDeliveryMinutes}
            onChange={resetToFirstPage(setMaxDeliveryMinutes)}
          />
          <Select
            aria-label="Sort by"
            options={SORT_OPTIONS}
            value={sort}
            onChange={resetToFirstPage((v: string) => setSort(v as RestaurantSort))}
          />
        </div>
      </div>

      {isError && <Alert variant="danger">Couldn&apos;t load restaurants — try again shortly.</Alert>}

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
              <Card key={restaurant._id} className="relative h-full transition-colors duration-150 hover:border-border-strong">
                <FavoriteButton restaurantId={restaurant._id} className="absolute top-3 right-3 z-10" />
                <NextLink href={`/restaurants/${restaurant.slug}`} className="block h-full">
                  <CardHeader>
                    <CardTitle className="pr-10">{restaurant.name}</CardTitle>
                    <CardDescription>
                      {restaurant.cuisineTypes.join(", ")} • ⭐ {restaurant.avgRating.toFixed(1)} •{" "}
                      {priceLevelLabel(restaurant.priceLevel)}
                      {restaurant.estimatedDeliveryMinutes ? ` • ~${restaurant.estimatedDeliveryMinutes} min` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-2">
                    <Badge variant={restaurant.isOpen ? "success" : "neutral"}>
                      {restaurant.isOpen ? "Open" : "Closed"}
                    </Badge>
                    {restaurant.cuisineTypes.slice(0, 3).map((cuisine) => (
                      <Badge key={cuisine} variant="primary">
                        {cuisine}
                      </Badge>
                    ))}
                  </CardContent>
                </NextLink>
              </Card>
            ))}
          </div>
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} className="self-center" />
        </>
      ) : (
        <EmptyState
          title="No restaurants found"
          description={search ? "Try a different search or filters." : "Check back soon — new restaurants are added regularly."}
        />
      )}
    </Container>
  );
}
