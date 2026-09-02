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
 * Lives in the persistent header (see `layout.tsx`) rather than only on the homepage, so search
 * is reachable from every page — see docs/ROADMAP.md FDP-46. Always navigates to `/restaurants`
 * (which reads the `search` param back out on mount), never manages results itself.
 */
export function HeaderSearch({ className }: { className?: string }) {
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
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted">
          <SearchIcon />
        </span>
        <Input
          type="search"
          placeholder={t("placeholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-10 pl-9"
          aria-label={t("placeholder")}
        />
      </div>
    </form>
  );
}
