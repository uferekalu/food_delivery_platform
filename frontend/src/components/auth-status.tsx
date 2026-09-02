"use client";

import { useTranslations } from "next-intl";
import { SmartLink } from "./smart-link";
import { cn } from "@/lib/cn";
import { useAppSelector } from "@/lib/redux/hooks";
import { useLogoutMutation } from "@/lib/redux/services/auth-api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

export interface AuthStatusProps {
  /** "stacked" is used inside the mobile nav menu — full-width, vertically stacked controls. */
  variant?: "inline" | "stacked";
  /** Fired after any navigation/logout action — lets the mobile menu close itself. */
  onNavigate?: () => void;
}

export function AuthStatus({ variant = "inline", onNavigate }: AuthStatusProps) {
  const t = useTranslations("AuthStatus");
  const { user, status } = useAppSelector((state) => state.auth);
  const [logout, { isLoading }] = useLogoutMutation();
  const stacked = variant === "stacked";

  // Avoid flashing "log in" while the silent session check (SessionInitializer) is in flight.
  if (status === "idle") {
    return <div className={cn("h-9", stacked ? "w-full" : "w-24")} aria-hidden="true" />;
  }

  if (status === "authenticated" && user) {
    return (
      <div className={cn("flex gap-3", stacked ? "flex-col items-stretch" : "items-center")}>
        {(user.role === "restaurant_owner" || user.role === "admin") && (
          <SmartLink
            href="/dashboard/restaurants"
            onClick={onNavigate}
            className={cn("text-sm text-primary hover:underline", stacked && "py-1")}
          >
            {t("myRestaurants")}
          </SmartLink>
        )}
        {user.role === "rider" && (
          <SmartLink
            href="/rider"
            onClick={onNavigate}
            className={cn("text-sm text-primary hover:underline", stacked && "py-1")}
          >
            {t("riderDashboard")}
          </SmartLink>
        )}
        {user.role === "admin" && (
          <SmartLink
            href="/admin"
            onClick={onNavigate}
            className={cn("text-sm text-primary hover:underline", stacked && "py-1")}
          >
            {t("adminDashboard")}
          </SmartLink>
        )}
        <SmartLink
          href="/orders"
          onClick={onNavigate}
          className={cn("text-sm text-primary hover:underline", stacked && "py-1")}
        >
          {t("myOrders")}
        </SmartLink>
        <SmartLink
          href="/account"
          onClick={onNavigate}
          className={cn("flex min-w-0 items-center gap-2 text-sm text-text-muted hover:text-text", stacked && "py-1")}
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
          className={stacked ? "w-full justify-start" : undefined}
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
