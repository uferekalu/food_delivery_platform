"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Drawer } from "@/components/ui/drawer";
import { IconButton } from "@/components/ui/icon-button";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  useGetCartQuery,
  useRemoveCartItemMutation,
  useUpdateCartItemMutation,
} from "@/lib/redux/services/cart-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { CartItem } from "@/lib/redux/restaurant-types";

function CartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5">
      <path
        d="M3 5h2l1.5 9a1.5 1.5 0 0 0 1.5 1.3h6a1.5 1.5 0 0 0 1.5-1.3L17 7H5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="18" r="1" fill="currentColor" />
      <circle cx="14" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

function CartLineItem({ item, currency }: { item: CartItem; currency: string }) {
  const t = useTranslations("CartDrawer");
  const [updateItem] = useUpdateCartItemMutation();
  const [removeItem, { isLoading: isRemoving }] = useRemoveCartItemMutation();
  const { toast } = useToast();

  const modifiersTotal = item.selectedModifiers.reduce((sum, m) => sum + m.priceDelta, 0);
  const lineTotal = (item.price + modifiersTotal) * item.qty;

  return (
    <div className="flex gap-3 border-b border-border pb-3">
      {item.imageUrl ? (
        // A small cart-drawer thumbnail doesn't warrant next/image's layout machinery.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="size-14 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-secondary text-text-muted">
          <CartIcon />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-text">{item.name}</span>
          {item.selectedModifiers.length > 0 && (
            <span className="text-xs text-text-muted">
              {item.selectedModifiers.map((m) => m.optionName).join(", ")}
            </span>
          )}
          {item.notes && <span className="text-xs text-text-muted italic">&quot;{item.notes}&quot;</span>}
        </div>
        <IconButton
          label={t("removeItem")}
          size="sm"
          variant="ghost"
          disabled={isRemoving}
          onClick={() => {
            void removeItem(item._id)
              .unwrap()
              .catch((err: unknown) =>
                toast({ title: t("couldNotRemoveItem"), description: getErrorMessage(err), variant: "danger" }),
              );
          }}
          icon={
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconButton
            label={t("decreaseQuantity")}
            size="sm"
            variant="outline"
            disabled={item.qty <= 1}
            onClick={() =>
              void updateItem({ cartItemId: item._id, body: { qty: item.qty - 1 } })
                .unwrap()
                .catch((err: unknown) =>
                  toast({ title: t("couldNotUpdateQuantity"), description: getErrorMessage(err), variant: "danger" }),
                )
            }
            icon={
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
                <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
          />
          <span className="w-5 text-center text-sm text-text">{item.qty}</span>
          <IconButton
            label={t("increaseQuantity")}
            size="sm"
            variant="outline"
            disabled={item.qty >= 20}
            onClick={() =>
              void updateItem({ cartItemId: item._id, body: { qty: item.qty + 1 } })
                .unwrap()
                .catch((err: unknown) =>
                  toast({ title: t("couldNotUpdateQuantity"), description: getErrorMessage(err), variant: "danger" }),
                )
            }
            icon={
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
          />
        </div>
        <span className="text-sm font-medium text-text">
          {currency} {lineTotal.toFixed(2)}
        </span>
      </div>
      </div>
    </div>
  );
}

export function CartDrawer() {
  const t = useTranslations("CartDrawer");
  const [open, setOpen] = useState(false);
  const { status } = useAppSelector((state) => state.auth);
  const { data: cart, isLoading } = useGetCartQuery(undefined, { skip: status !== "authenticated" });

  if (status !== "authenticated") return null;

  const itemCount = cart?.items.reduce((sum, item) => sum + item.qty, 0) ?? 0;

  return (
    <>
      <div className="relative">
        <IconButton label={t("openCart")} icon={<CartIcon />} onClick={() => setOpen(true)} />
        {itemCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
            {itemCount > 9 ? "9+" : itemCount}
          </span>
        )}
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title={t("yourCart")}>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !cart || cart.items.length === 0 ? (
          <EmptyState title={t("emptyCartTitle")} description={t("emptyCartDescription")} />
        ) : (
          <>
            <p className="text-sm font-medium text-text">{cart.restaurantName}</p>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
              {cart.items.map((item) => (
                <CartLineItem key={item._id} item={item} currency={cart.currency ?? ""} />
              ))}
            </div>
            <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
              <div className="flex items-center justify-between text-sm font-semibold text-text">
                <span>{t("subtotal")}</span>
                <span>
                  {cart.currency} {cart.subtotal.toFixed(2)}
                </span>
              </div>
              <Link
                href="/checkout"
                onClick={() => setOpen(false)}
                className={buttonVariants({ className: "w-full" })}
              >
                {t("checkout")}
              </Link>
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
