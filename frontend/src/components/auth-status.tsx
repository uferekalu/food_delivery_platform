"use client";

import NextLink from "next/link";
import { useAppSelector } from "@/lib/redux/hooks";
import { useLogoutMutation } from "@/lib/redux/services/auth-api";
import { Button, buttonVariants } from "@/components/ui/button";

export function AuthStatus() {
  const { user, status } = useAppSelector((state) => state.auth);
  const [logout, { isLoading }] = useLogoutMutation();

  // Avoid flashing "log in" while the silent session check (SessionInitializer) is in flight.
  if (status === "idle") return <div className="h-9 w-24" aria-hidden="true" />;

  if (status === "authenticated" && user) {
    return (
      <div className="flex items-center gap-3">
        {(user.role === "restaurant_owner" || user.role === "admin") && (
          <NextLink href="/dashboard/restaurants" className="text-sm text-primary hover:underline">
            My restaurants
          </NextLink>
        )}
        <span className="text-sm text-text-muted">
          Hi, {user.name}
          {!user.isEmailVerified && <span className="ml-1 text-warning">(unverified)</span>}
        </span>
        <Button variant="ghost" size="sm" isLoading={isLoading} onClick={() => void logout()}>
          Log out
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <NextLink href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Log in
      </NextLink>
      <NextLink href="/register" className={buttonVariants({ variant: "primary", size: "sm" })}>
        Sign up
      </NextLink>
    </div>
  );
}
