"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useListAllRidersQuery, useVerifyRiderMutation } from "@/lib/redux/services/riders-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { Rider } from "@/lib/redux/restaurant-types";

function RiderCard({ rider }: { rider: Rider }) {
  const { toast } = useToast();
  const [verify, { isLoading }] = useVerifyRiderMutation();

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-medium text-text capitalize">{rider.vehicleType}</span>
          <Badge variant={rider.isVerified ? "success" : "warning"}>
            {rider.isVerified ? "Verified" : "Pending"}
          </Badge>
        </div>
        <span className="text-sm text-text-muted">
          Applied {new Date(rider.createdAt).toLocaleDateString()}
        </span>
        {!rider.isVerified && (
          <Button
            size="sm"
            className="self-start"
            isLoading={isLoading}
            onClick={() =>
              void verify(rider._id)
                .unwrap()
                .then(() => toast({ title: "Rider verified", variant: "success" }))
                .catch((err: unknown) =>
                  toast({ title: "Couldn't verify rider", description: getErrorMessage(err), variant: "danger" }),
                )
            }
          >
            Verify
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function RidersTab() {
  const { data, isLoading } = useListAllRidersQuery();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState title="No riders yet" description="Rider applications will show up here." />;
  }

  // Pending-verification riders need attention first — sort them ahead of already-verified ones.
  const sorted = [...data].sort((a, b) => Number(a.isVerified) - Number(b.isVerified));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((rider) => (
        <RiderCard key={rider._id} rider={rider} />
      ))}
    </div>
  );
}
