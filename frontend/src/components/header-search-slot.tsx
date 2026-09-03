"use client";

import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { HeaderSearch } from "@/components/header-search";

/**
 * Wraps `HeaderSearch` with the one bit of routing awareness it needs but shouldn't own itself:
 * on the homepage (desktop only — this only ever applies at `sm:` and up, see
 * docs/ROADMAP.md FDP-85), the header's own search collapses away because the homepage hero has
 * its own, more prominent search box instead. `AppShell` (the header's home) is a Server
 * Component and can't call `usePathname()`, hence this tiny client wrapper rather than teaching
 * `HeaderSearch` itself about which page it's on.
 */
export function HeaderSearchSlot() {
  const pathname = usePathname();
  const isHomepage = pathname === "/";

  return (
    <HeaderSearch
      className={cn("order-3 w-full sm:order-0 sm:w-auto sm:max-w-md sm:flex-1", isHomepage && "sm:hidden")}
    />
  );
}
