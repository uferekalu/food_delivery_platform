"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Rating } from "@/components/ui/rating";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { useListReviewsQuery } from "@/lib/redux/services/reviews-api";
import type { ReviewTargetType } from "@/lib/redux/restaurant-types";
import { useState } from "react";

export interface ReviewsListProps {
  targetType: ReviewTargetType;
  targetId: string;
}

export function ReviewsList({ targetType, targetId }: ReviewsListProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListReviewsQuery({ targetType, targetId, page, limit: 10 });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return <EmptyState title="No reviews yet" description="Be the first to share your experience." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {data.items.map((review) => (
        <Card key={review._id}>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Avatar src={review.authorId.avatarUrl} name={review.authorId.name} size="sm" />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text">{review.authorId.name}</span>
                <span className="text-xs text-text-muted">{new Date(review.createdAt).toLocaleDateString()}</span>
              </div>
              <Rating value={review.rating} className="ml-auto" />
            </div>
            {review.comment && <p className="text-sm text-text">{review.comment}</p>}
            {review.images.length > 0 && (
              <div className="flex gap-2">
                {review.images.map((src) => (
                  // A handful of user-submitted review photos don't warrant next/image's layout machinery.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt="" className="size-20 rounded-md object-cover" />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      <Pagination page={page} totalPages={data.totalPages} onChange={setPage} className="self-center" />
    </div>
  );
}
