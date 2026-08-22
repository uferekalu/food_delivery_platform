"use client";

import NextLink from "next/link";
import { cn } from "@/lib/cn";
import { useAppSelector } from "@/lib/redux/hooks";
import { useLogoutMutation } from "@/lib/redux/services/auth-api";
import { Button, buttonVariants } from "@/components/ui/button";

export interface AuthStatusProps {
  /** "stacked" is used inside the mobile nav menu — full-width, vertically stacked controls. */
  variant?: "inline" | "stacked";
  /** Fired after any navigation/logout action — lets the mobile menu close itself. */
  onNavigate?: () => void;
}

export function AuthStatus({ variant = "inline", onNavigate }: AuthStatusProps) {
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
          <NextLink
            href="/dashboard/restaurants"
            onClick={onNavigate}
            className={cn("text-sm text-primary hover:underline", stacked && "py-1")}
          >
            My restaurants
          </NextLink>
        )}
        <span className={cn("truncate text-sm text-text-muted", stacked && "py-1")}>
          Hi, {user.name}
          {!user.isEmailVerified && <span className="ml-1 text-warning">(unverified)</span>}
        </span>
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
          Log out
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2", stacked ? "flex-col items-stretch" : "items-center")}>
      <NextLink
        href="/login"
        onClick={onNavigate}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), stacked && "w-full justify-center")}
      >
        Log in
      </NextLink>
      <NextLink
        href="/register"
        onClick={onNavigate}
        className={cn(buttonVariants({ variant: "primary", size: "sm" }), stacked && "w-full justify-center")}
      >
        Sign up
      </NextLink>
    </div>
  );
}
