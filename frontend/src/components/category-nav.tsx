"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export interface CategoryNavItem {
  id: string;
  name: string;
}

function scrollToCategory(id: string) {
  document.getElementById(`category-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Category jump-list for a restaurant/store's menu or catalog (docs/ROADMAP.md FDP-131, direct
 * reference: glovoapp.com/en/ng/lagos/stores/chicken-republic-los's left-side "Top sellers /
 * Burgers & Sandwiches / Citizens Meals / …" nav) — the menu/catalog itself was previously just
 * one long flat scroll with no way to jump to a category. Renders twice: a sticky left sidebar at
 * `lg:` and up, a sticky horizontal scrollable chip row below it, both driving the exact same
 * `scrollToCategory` — the calling page only needs to give each category section
 * `id={`category-${id}`}` (plus `scroll-mt-*` to clear the sticky header/nav above it) for this
 * to work; no ref plumbing between page and nav. Active-category highlighting uses
 * `IntersectionObserver` against those same section ids rather than a scroll-position listener —
 * cheaper, and avoids a manual rAF-throttled scroll handler for what's fundamentally "which
 * section is near the top of the viewport right now." `rootMargin`'s asymmetric top/bottom
 * (a deep negative top, close to 0 at bottom) approximates "the topmost category whose heading
 * has passed under the sticky nav," matching where a user's eye actually is while scrolling.
 * Renders nothing for 0-1 categories — a jump list to jump nowhere is just clutter.
 */
export function CategoryNav({ categories }: { categories: CategoryNavItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(categories[0]?.id ?? null);

  useEffect(() => {
    if (categories.length <= 1) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id.replace("category-", ""));
      },
      { rootMargin: "-140px 0px -70% 0px", threshold: 0 },
    );
    const elements = categories
      .map((cat) => document.getElementById(`category-${cat.id}`))
      .filter((el): el is HTMLElement => el !== null);
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [categories]);

  if (categories.length <= 1) return null;

  return (
    <>
      <nav className="hidden shrink-0 lg:block lg:w-56" aria-label="Categories">
        <div className="sticky top-24 flex max-h-[calc(100vh-7rem)] flex-col gap-1 overflow-y-auto">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => scrollToCategory(cat.id)}
              aria-current={activeId === cat.id ? "true" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-150",
                activeId === cat.id
                  ? "bg-primary-subtle text-primary-subtle-foreground"
                  : "text-text-muted hover:bg-secondary hover:text-text",
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </nav>

      <nav
        className="sticky top-32 z-[var(--z-sticky)] -mx-4 flex gap-2 overflow-x-auto border-b border-border bg-surface px-4 py-2.5 sm:top-18 lg:hidden"
        aria-label="Categories"
      >
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => scrollToCategory(cat.id)}
            aria-current={activeId === cat.id ? "true" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150",
              activeId === cat.id
                ? "border-primary bg-primary text-text-on-primary"
                : "border-border-strong bg-surface text-text",
            )}
          >
            {cat.name}
          </button>
        ))}
      </nav>
    </>
  );
}
