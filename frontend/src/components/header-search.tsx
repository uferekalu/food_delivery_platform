"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/input";

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4 shrink-0">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17 17l-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Reachable from every page's persistent header by default (see `layout.tsx`) — see
 * docs/ROADMAP.md FDP-46 — except the homepage, which replaces it with this same component
 * re-themed for its dark hero banner instead (docs/ROADMAP.md FDP-85; the header row was
 * getting crowded, and the homepage already has a prominent place for search). Always navigates
 * to `/restaurants` (which reads the `search` param back out on mount), never manages results
 * itself.
 */
export function HeaderSearch({
  className,
  inputClassName,
  iconClassName,
}: {
  className?: string;
  /** Overrides the input's own background/border/text — used by the homepage hero, which is
   * always dark regardless of site theme, so the default light-surface input would otherwise
   * have poor contrast there. */
  inputClassName?: string;
  iconClassName?: string;
}) {
  const t = useTranslations("HeaderSearch");
  const router = useRouter();
  const [value, setValue] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    router.push(trimmed ? `/restaurants?search=${encodeURIComponent(trimmed)}` : "/restaurants");
  }

  return (
    <form onSubmit={onSubmit} role="search" className={cn("min-w-0", className)}>
      <div className="relative">
        <span
          className={cn("pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted", iconClassName)}
        >
          <SearchIcon />
        </span>
        <Input
          type="search"
          placeholder={t("placeholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={cn("h-10 pl-9", inputClassName)}
          aria-label={t("placeholder")}
        />
      </div>
    </form>
  );
}
