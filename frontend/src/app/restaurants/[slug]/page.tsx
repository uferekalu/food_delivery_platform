"use client";

import { use } from "react";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useGetRestaurantBySlugQuery } from "@/lib/redux/services/restaurants-api";
import { useGetMenuQuery } from "@/lib/redux/services/menu-api";

export default function RestaurantDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: restaurant, isLoading: loadingRestaurant, isError } = useGetRestaurantBySlugQuery(slug);
  const { data: menu, isLoading: loadingMenu } = useGetMenuQuery(restaurant?._id ?? "", {
    skip: !restaurant,
  });

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
        <EmptyState title="Restaurant not found" description="It may be unavailable or the link is incorrect." />
      </Container>
    );
  }

  return (
    <Container className="flex flex-col gap-6 py-10">
      <Breadcrumbs items={[{ label: "Restaurants", href: "/restaurants" }, { label: restaurant.name }]} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-text">{restaurant.name}</h1>
          <Badge variant={restaurant.isOpen ? "success" : "neutral"}>{restaurant.isOpen ? "Open" : "Closed"}</Badge>
        </div>
        <p className="text-text-muted">
          {restaurant.cuisineTypes.join(", ")} • ⭐ {restaurant.avgRating.toFixed(1)} ({restaurant.reviewCount}{" "}
          reviews)
        </p>
        {restaurant.description && <p className="max-w-2xl text-text">{restaurant.description}</p>}
        <p className="text-sm text-text-muted">
          {restaurant.address.line1}, {restaurant.address.city}, {restaurant.address.state}
        </p>
      </div>

      {!restaurant.isOpen && (
        <Alert variant="warning" title="Currently closed">
          This restaurant isn&apos;t accepting orders right now.
        </Alert>
      )}

      <div className="flex flex-col gap-8">
        <h2 className="text-xl font-semibold text-text">Menu</h2>
        {loadingMenu ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !menu || menu.length === 0 ? (
          <EmptyState title="Menu coming soon" description="This restaurant hasn't published their menu yet." />
        ) : (
          menu.map((category) => (
            <div key={category._id} className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold text-text">{category.name}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {category.items
                  .filter((item) => item.isAvailable)
                  .map((item) => (
                    <div key={item._id} className="flex flex-col gap-2 rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-text">{item.name}</span>
                          {item.description && <span className="text-sm text-text-muted">{item.description}</span>}
                        </div>
                        <span className="shrink-0 font-semibold text-text">
                          {restaurant.currency} {item.price.toFixed(2)}
                        </span>
                      </div>
                      {item.modifierGroups.length > 0 && (
                        <div className="flex flex-col gap-1 border-t border-border pt-2">
                          {item.modifierGroups.map((group) => (
                            <div key={group.name} className="text-xs text-text-muted">
                              <span className="font-medium text-text">{group.name}</span>
                              {group.min > 0 && <span> (required)</span>}
                              {": "}
                              {group.options
                                .map((option) =>
                                  option.priceDelta > 0
                                    ? `${option.name} (+${restaurant.currency} ${option.priceDelta.toFixed(2)})`
                                    : option.name,
                                )
                                .join(", ")}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Container>
  );
}
