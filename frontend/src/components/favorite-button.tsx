"use client";

import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  useAddFavoriteMutation,
  useAddFavoriteStoreMutation,
  useListFavoritesQuery,
  useListFavoriteStoresQuery,
  useRemoveFavoriteMutation,
  useRemoveFavoriteStoreMutation,
} from "@/lib/redux/services/account-api";
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

// Store-catalog counterpart of restaurantId (docs/ROADMAP.md FDP-137) — a discriminated union
// rather than two optional props, so a caller can never accidentally pass both/neither.
export type FavoriteButtonProps = { className?: string } & (
  | { restaurantId: string; storeId?: undefined }
  | { storeId: string; restaurantId?: undefined }
);

/**
 * A sibling of any surrounding `NextLink`, never nested inside one — an interactive `<button>`
 * inside an `<a>` is invalid HTML/a11y (see frontend/CLAUDE.md's item-detail-modal precedent).
 * Callers position this absolutely over a link-wrapped card instead.
 */
export function FavoriteButton({ restaurantId, storeId, className }: FavoriteButtonProps) {
  const t = useTranslations("FavoriteButton");
  const { status } = useAppSelector((state) => state.auth);
  const authenticated = status === "authenticated";

  // Exactly one of these two query/mutation trios is ever actually used, gated by `skip` —
  // React hooks can't be called conditionally, so both are always called, cheaply no-op'd via
  // `skip` for whichever kind this instance isn't.
  const { data: favoriteRestaurants } = useListFavoritesQuery(undefined, {
    skip: !authenticated || restaurantId === undefined,
  });
  const { data: favoriteStores } = useListFavoriteStoresQuery(undefined, {
    skip: !authenticated || storeId === undefined,
  });
  const [addFavorite, { isLoading: isAddingRestaurant }] = useAddFavoriteMutation();
  const [removeFavorite, { isLoading: isRemovingRestaurant }] = useRemoveFavoriteMutation();
  const [addFavoriteStore, { isLoading: isAddingStore }] = useAddFavoriteStoreMutation();
  const [removeFavoriteStore, { isLoading: isRemovingStore }] = useRemoveFavoriteStoreMutation();
  const { toast } = useToast();

  if (!authenticated) return null;

  const isFavorite =
    restaurantId !== undefined
      ? (favoriteRestaurants?.some((r) => r._id === restaurantId) ?? false)
      : (favoriteStores?.some((s) => s._id === storeId) ?? false);
  const isLoading = isAddingRestaurant || isRemovingRestaurant || isAddingStore || isRemovingStore;

  function toggle() {
    const action =
      restaurantId !== undefined
        ? isFavorite
          ? removeFavorite(restaurantId)
          : addFavorite(restaurantId)
        : isFavorite
          ? removeFavoriteStore(storeId!)
          : addFavoriteStore(storeId!);
    void action.unwrap().catch((err: unknown) =>
      toast({ title: t("couldNotUpdateFavorites"), description: getErrorMessage(err), variant: "danger" }),
    );
  }

  return (
    <IconButton
      label={isFavorite ? t("removeFromFavorites") : t("addToFavorites")}
      variant="secondary"
      size="sm"
      disabled={isLoading}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      icon={<HeartIcon filled={isFavorite} />}
    />
  );
}
