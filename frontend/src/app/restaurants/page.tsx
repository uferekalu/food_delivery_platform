"use client";

import { useState } from "react";
import NextLink from "next/link";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Alert } from "@/components/ui/alert";
import { FavoriteButton } from "@/components/favorite-button";
import { useListRestaurantsQuery } from "@/lib/redux/services/restaurants-api";

export default function RestaurantsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useListRestaurantsQuery({ search: search || undefined, page, limit: 10 });

  return (
    <Container className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-text">Restaurants</h1>
        <p className="text-text-muted">Order from restaurants near you.</p>
      </div>

      <Input
        type="search"
        placeholder="Search restaurants…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-sm"
        aria-label="Search restaurants"
      />

      {isError && <Alert variant="danger">Couldn&apos;t load restaurants — try again shortly.</Alert>}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((restaurant) => (
              <Card key={restaurant._id} className="relative h-full transition-colors duration-150 hover:border-border-strong">
                <FavoriteButton restaurantId={restaurant._id} className="absolute top-3 right-3 z-10" />
                <NextLink href={`/restaurants/${restaurant.slug}`} className="block h-full">
                  <CardHeader>
                    <CardTitle className="pr-10">{restaurant.name}</CardTitle>
                    <CardDescription>
                      {restaurant.cuisineTypes.join(", ")} • ⭐ {restaurant.avgRating.toFixed(1)}
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
          description={search ? "Try a different search." : "Check back soon — new restaurants are added regularly."}
        />
      )}
    </Container>
  );
}
