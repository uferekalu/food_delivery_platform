"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/lib/redux/hooks";
import type { UserRole } from "@/lib/constants/roles";
import { Spinner } from "@/components/ui/spinner";

export interface RequireRoleProps {
  roles: UserRole[];
  children: React.ReactNode;
}

/**
 * Gates a page to signed-in users with one of `roles`. Renders a loading state while the
 * silent session check (SessionInitializer) is still in flight — redirecting before that
 * resolves would incorrectly bounce a returning, still-authenticated user to /login.
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const router = useRouter();
  const { user, status } = useAppSelector((state) => state.auth);

  const allowed = status === "authenticated" && !!user && roles.includes(user.role);
  const denied = status === "unauthenticated" || (status === "authenticated" && !allowed);

  useEffect(() => {
    if (denied) router.replace("/login");
  }, [denied, router]);

  if (allowed) return children;

  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner size="lg" label="Checking your session" />
    </div>
  );
}
