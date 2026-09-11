"use client";

import { useTranslations } from "next-intl";
import { SmartLink } from "./smart-link";
import { cn } from "@/lib/cn";
import { useAppSelector } from "@/lib/redux/hooks";
import { useLogoutMutation } from "@/lib/redux/services/auth-api";
import { useRouter } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/dropdown-menu";

export interface AuthStatusProps {
  /** "stacked" is used inside the mobile nav menu — full-width, vertically stacked controls,
   * kept as plain links rather than a dropdown since a drawer already has the vertical room a
   * congested header doesn't. */
  variant?: "inline" | "stacked";
  /** Fired after any navigation/logout action — lets the mobile menu close itself. */
  onNavigate?: () => void;
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0 text-text-muted">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AuthStatus({ variant = "inline", onNavigate }: AuthStatusProps) {
  const t = useTranslations("AuthStatus");
  const router = useRouter();
  const { user, status } = useAppSelector((state) => state.auth);
  const [logout, { isLoading }] = useLogoutMutation();
  const stacked = variant === "stacked";

  // Avoid flashing "log in" while the silent session check (SessionInitializer) is in flight.
  if (status === "idle") {
    return <div className={cn("h-9", stacked ? "w-full" : "w-24")} aria-hidden="true" />;
  }

  if (status === "authenticated" && user) {
    // Every one of a vendor/admin/rider's account links used to render as its own separate
    // inline element next to notifications/cart/language/theme — on a real account with several
    // roles' worth of links (e.g. an admin who's also a restaurant_owner) that's 5-6 separate
    // clickable things crammed into one row, the exact "congested header" the user reported
    // (screenshot-annotated). Collapsed into a single avatar-triggered dropdown instead — the
    // standard account-menu pattern — so the header itself only ever shows one control for
    // "everything about my account," regardless of how many roles/links a given user has.
    if (!stacked) {
      const items: DropdownMenuItem[] = [];
      if (user.role === "restaurant_owner" || user.role === "admin") {
        items.push({ label: t("myRestaurants"), onSelect: () => router.push("/dashboard/restaurants") });
        items.push({ label: t("myStores"), onSelect: () => router.push("/dashboard/stores") });
      }
      if (user.role === "restaurant_owner") {
        items.push({ label: t("messages"), onSelect: () => router.push("/dashboard/messages") });
      }
      if (user.role === "rider") {
        items.push({ label: t("riderDashboard"), onSelect: () => router.push("/rider") });
      }
      if (user.role === "admin") {
        items.push({ label: t("adminDashboard"), onSelect: () => router.push("/admin") });
      }
      items.push({ label: t("myOrders"), onSelect: () => router.push("/orders") });
      items.push({ label: t("myAccount"), onSelect: () => router.push("/account") });
      items.push({
        label: t("logOut"),
        destructive: true,
        onSelect: () => void logout(),
      });

      return (
        <DropdownMenu
          align="end"
          items={items}
          trigger={(triggerProps) => (
            <button
              type="button"
              {...triggerProps}
              className="flex min-w-0 items-center gap-2 rounded-full py-1 pr-1 pl-1 text-sm text-text-muted transition-colors duration-150 hover:bg-secondary hover:text-text"
            >
              <Avatar src={user.avatarUrl} name={user.name} size="sm" />
              <span className="hidden max-w-28 truncate lg:inline">
                {user.name}
                {!user.isEmailVerified && <span className="ml-1 text-warning">{t("unverified")}</span>}
              </span>
              <ChevronDownIcon />
            </button>
          )}
        />
      );
    }

    return (
      <div className="flex flex-col items-stretch gap-3">
        {(user.role === "restaurant_owner" || user.role === "admin") && (
          <SmartLink href="/dashboard/restaurants" onClick={onNavigate} className="py-1 text-sm text-primary hover:underline">
            {t("myRestaurants")}
          </SmartLink>
        )}
        {(user.role === "restaurant_owner" || user.role === "admin") && (
          <SmartLink href="/dashboard/stores" onClick={onNavigate} className="py-1 text-sm text-primary hover:underline">
            {t("myStores")}
          </SmartLink>
        )}
        {/* Not shown to admin, unlike the two links above — this is the vendor's own
            conversation with "admin" as a role; an admin has their own dedicated inbox (the
            "Messages" tab in /admin) instead of a single vendor-shaped thread of their own. */}
        {user.role === "restaurant_owner" && (
          <SmartLink href="/dashboard/messages" onClick={onNavigate} className="py-1 text-sm text-primary hover:underline">
            {t("messages")}
          </SmartLink>
        )}
        {user.role === "rider" && (
          <SmartLink href="/rider" onClick={onNavigate} className="py-1 text-sm text-primary hover:underline">
            {t("riderDashboard")}
          </SmartLink>
        )}
        {user.role === "admin" && (
          <SmartLink href="/admin" onClick={onNavigate} className="py-1 text-sm text-primary hover:underline">
            {t("adminDashboard")}
          </SmartLink>
        )}
        <SmartLink href="/orders" onClick={onNavigate} className="py-1 text-sm text-primary hover:underline">
          {t("myOrders")}
        </SmartLink>
        <SmartLink
          href="/account"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2 py-1 text-sm text-text-muted hover:text-text"
        >
          <Avatar src={user.avatarUrl} name={user.name} size="sm" />
          <span className="truncate">
            {user.name}
            {!user.isEmailVerified && <span className="ml-1 text-warning">{t("unverified")}</span>}
          </span>
        </SmartLink>
        <Button
          variant="ghost"
          size="sm"
          isLoading={isLoading}
          onClick={() => {
            void logout();
            onNavigate?.();
          }}
          className="w-full justify-start"
        >
          {t("logOut")}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2", stacked ? "flex-col items-stretch" : "items-center")}>
      <SmartLink
        href="/login"
        onClick={onNavigate}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), stacked && "w-full justify-center")}
      >
        {t("logIn")}
      </SmartLink>
      <SmartLink
        href="/register"
        onClick={onNavigate}
        className={cn(buttonVariants({ variant: "primary", size: "sm" }), stacked && "w-full justify-center")}
      >
        {t("signUp")}
      </SmartLink>
    </div>
  );
}
