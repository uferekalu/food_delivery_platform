"use client";

import { useState } from "react";
import NextLink from "next/link";
import { cn } from "@/lib/cn";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setThemeMode } from "@/lib/redux/slices/theme-slice";
import type { ThemeMode } from "@/lib/theme";
import { Drawer } from "@/components/ui/drawer";
import { IconButton } from "@/components/ui/icon-button";
import { AuthStatus } from "./auth-status";

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/**
 * Inline segmented control, not a `ThemeToggle` (which opens a `DropdownMenu`) — see
 * `Drawer`'s doc comment for why a portal-based dropdown can't be nested inside another
 * portal-based overlay without going invisible behind the outer one's backdrop.
 */
function ThemeSwitcher() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.theme.mode);

  return (
    <div role="radiogroup" aria-label="Theme" className="flex gap-1 rounded-md bg-secondary p-1">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={mode === option.value}
          onClick={() => dispatch(setThemeMode(option.value))}
          className={cn(
            "flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors duration-150",
            mode === option.value ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Below `sm` (640px), the header's inline nav/auth/theme controls would overflow — see
 * frontend/CLAUDE.md "Responsive design". This collapses them into a hamburger-triggered
 * slide-in drawer. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="sm:hidden">
      <IconButton label="Open menu" icon={<MenuIcon />} onClick={() => setOpen(true)} />
      <Drawer open={open} onClose={close} title="Menu">
        <NextLink
          href="/restaurants"
          onClick={close}
          className="rounded-md px-1 py-2 text-sm font-medium text-text hover:bg-secondary"
        >
          Restaurants
        </NextLink>
        <div className="border-t border-border" />
        <AuthStatus variant="stacked" onNavigate={close} />
        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-5">
          <span className="text-sm font-medium text-text">Theme</span>
          <ThemeSwitcher />
        </div>
      </Drawer>
    </div>
  );
}
