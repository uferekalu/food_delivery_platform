"use client";

import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { useAddFavoriteMutation, useListFavoritesQuery, useRemoveFavoriteMutation } from "@/lib/redux/services/account-api";
import { getErrorMessage } from "@/lib/redux/error";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill={filled ? "currentColor" : "none"}>
      <path
        d="M10 17s-6.5-4.06-6.5-8.5A3.5 3.5 0 0110 5.5 3.5 3.5 0 0116.5 8.5c0 4.44-6.5 8.5-6.5 8.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface FavoriteButtonProps {
  restaurantId: string;
  className?: string;
}

/**
 * A sibling of any surrounding `NextLink`, never nested inside one — an interactive `<button>`
 * inside an `<a>` is invalid HTML/a11y (see frontend/CLAUDE.md's item-detail-modal precedent).
 * Callers position this absolutely over a link-wrapped card instead.
 */
export function FavoriteButton({ restaurantId, className }: FavoriteButtonProps) {
  const { status } = useAppSelector((state) => state.auth);
  const { data: favorites } = useListFavoritesQuery(undefined, { skip: status !== "authenticated" });
  const [addFavorite, { isLoading: isAdding }] = useAddFavoriteMutation();
  const [removeFavorite, { isLoading: isRemoving }] = useRemoveFavoriteMutation();
  const { toast } = useToast();

  if (status !== "authenticated") return null;

  const isFavorite = favorites?.some((r) => r._id === restaurantId) ?? false;

  return (
    <IconButton
      label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      variant="secondary"
      size="sm"
      disabled={isAdding || isRemoving}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = isFavorite ? removeFavorite(restaurantId) : addFavorite(restaurantId);
        void action.unwrap().catch((err: unknown) =>
          toast({ title: "Couldn't update favorites", description: getErrorMessage(err), variant: "danger" }),
        );
      }}
      icon={<HeartIcon filled={isFavorite} />}
    />
  );
}
