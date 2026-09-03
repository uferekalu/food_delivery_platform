"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setThemeMode } from "@/lib/redux/slices/theme-slice";
import type { ThemeMode } from "@/lib/theme";
import { Drawer } from "@/components/ui/drawer";
import { IconButton } from "@/components/ui/icon-button";
import { Link } from "@/i18n/navigation";
import { AuthStatus } from "./auth-status";
import { LanguageSwitcher } from "./language-switcher";

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const THEME_MODES: ThemeMode[] = ["light", "dark", "system"];

/**
 * Inline segmented control, not a `ThemeToggle` (which opens a `DropdownMenu`) — see
 * `Drawer`'s doc comment for why a portal-based dropdown can't be nested inside another
 * portal-based overlay without going invisible behind the outer one's backdrop.
 */
function ThemeSwitcher() {
  const t = useTranslations("Theme");
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.theme.mode);

  return (
    <div role="radiogroup" aria-label={t("label")} className="flex gap-1 rounded-md bg-secondary p-1">
      {THEME_MODES.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          onClick={() => dispatch(setThemeMode(value))}
          className={cn(
            "flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors duration-150",
            mode === value ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text",
          )}
        >
          {t(value)}
        </button>
      ))}
    </div>
  );
}

/** Below `sm` (640px), the header's inline nav/auth/theme controls would overflow — see
 * frontend/CLAUDE.md "Responsive design". This collapses them into a hamburger-triggered
 * slide-in drawer. */
export function MobileNav() {
  const t = useTranslations("MobileNav");
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="sm:hidden">
      <IconButton label={t("openMenu")} icon={<MenuIcon />} onClick={() => setOpen(true)} />
      <Drawer open={open} onClose={close} title={t("menuTitle")}>
        <Link
          href="/restaurants"
          onClick={close}
          className="rounded-md px-1 py-2 text-sm font-medium text-text hover:bg-secondary"
        >
          {t("restaurants")}
        </Link>
        <div className="border-t border-border" />
        <AuthStatus variant="stacked" onNavigate={close} />
        <div className="mt-auto flex flex-col gap-4 border-t border-border pt-5">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text">{t("language")}</span>
            <LanguageSwitcher className="w-full" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text">{t("theme")}</span>
            <ThemeSwitcher />
          </div>
        </div>
      </Drawer>
    </div>
  );
}
