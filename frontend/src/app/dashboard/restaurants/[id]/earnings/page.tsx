"use client";

import { use } from "react";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useGetMyRestaurantsQuery } from "@/lib/redux/services/restaurants-api";
import { useGetRestaurantEarningsQuery } from "@/lib/redux/services/orders-api";

function EarningsStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-2xl font-bold text-text">{value}</span>
    </div>
  );
}

function Earnings({ restaurantId, restaurantName }: { restaurantId: string; restaurantName: string }) {
  const { data, isLoading } = useGetRestaurantEarningsQuery(restaurantId);

  return (
    <Container className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text">Earnings</h1>
        <p className="text-text-muted">{restaurantName}</p>
      </div>

      {isLoading || !data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          {!data.payoutSetupComplete && (
            <Alert variant="warning" title="Payout setup required">
              Automated payouts aren&apos;t connected for this restaurant yet — your earnings below
              are informational until that&apos;s set up. We&apos;ll let you know here as soon as
              it&apos;s available.
            </Alert>
          )}

          {data.deliveredOrders === 0 ? (
            <EmptyState
              title="No earnings yet"
              description="Earnings appear here once an order for this restaurant is delivered."
            />
          ) : (
            <Card>
              <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <EarningsStat
                  label="Gross revenue"
                  value={`${data.currency} ${data.grossRevenue.toFixed(2)}`}
                />
                <EarningsStat
                  label="Platform fee"
                  value={`-${data.currency} ${data.platformFeeTotal.toFixed(2)}`}
                />
                <EarningsStat label="Net earned" value={`${data.currency} ${data.netEarned.toFixed(2)}`} />
              </CardContent>
              <CardContent className="border-t border-border pt-4 text-sm text-text-muted">
                From {data.deliveredOrders} delivered order{data.deliveredOrders === 1 ? "" : "s"}.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Container>
  );
}

function EarningsPage({ id }: { id: string }) {
  const { data: restaurants, isLoading } = useGetMyRestaurantsQuery();
  const restaurant = restaurants?.find((r) => r._id === id);

  if (isLoading) {
    return (
      <Container className="py-10">
        <Skeleton className="h-64 w-full" />
      </Container>
    );
  }

  if (!restaurant) {
    return (
      <Container className="py-10">
        <EmptyState title="Restaurant not found" description="It may not exist, or you don't have access to it." />
      </Container>
    );
  }

  return <Earnings restaurantId={id} restaurantName={restaurant.name} />;
}

export default function DashboardRestaurantEarningsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <EarningsPage id={id} />
    </RequireRole>
  );
}
