"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter as usePlainRouter } from "next/navigation";
import { useRouter as useLocaleRouter, usePathname } from "@/i18n/navigation";
import { isOutOfScopePath } from "@/i18n/scope";
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
 *
 * Used by both in-scope pages (dashboard, since FDP-70) and out-of-scope ones (admin/rider,
 * still English-only) — the locale-aware router would incorrectly prefix `/login` with the
 * current locale when redirecting from an out-of-scope page that has no real locale context, so
 * this picks the router based on where it's actually rendering, same as SmartLink/
 * LanguageSwitcher.
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const t = useTranslations("Common");
  const plainRouter = usePlainRouter();
  const localeRouter = useLocaleRouter();
  const pathname = usePathname();
  const { user, status } = useAppSelector((state) => state.auth);

  const allowed = status === "authenticated" && !!user && roles.includes(user.role);
  const denied = status === "unauthenticated" || (status === "authenticated" && !allowed);

  useEffect(() => {
    if (!denied) return;
    if (isOutOfScopePath(pathname)) {
      plainRouter.replace("/login");
    } else {
      localeRouter.replace("/login");
    }
  }, [denied, pathname, plainRouter, localeRouter]);

  if (allowed) return children;

  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner size="lg" label={t("checkingSession")} />
    </div>
  );
}
