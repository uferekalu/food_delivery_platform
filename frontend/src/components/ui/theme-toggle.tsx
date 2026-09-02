"use client";

import { useTranslations } from "next-intl";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setThemeMode } from "@/lib/redux/slices/theme-slice";
import { useSystemPrefersDark } from "@/lib/theme";
import { DropdownMenu, type DropdownMenuItem } from "./dropdown-menu";
import { IconButton } from "./icon-button";

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 2v2M10 16v2M18 10h-2M4 10H2M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4M15.5 15.5l-1.4-1.4M5.9 5.9L4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <path
        d="M17 10.5A7 7 0 119.5 3a5.5 5.5 0 007.5 7.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const t = useTranslations("Theme");
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.theme.mode);
  const systemPrefersDark = useSystemPrefersDark();
  const resolvedDark = mode === "dark" || (mode === "system" && systemPrefersDark);

  const items: DropdownMenuItem[] = (["light", "dark", "system"] as const).map((value) => ({
    label: mode === value ? `${t(value)} ✓` : t(value),
    onSelect: () => dispatch(setThemeMode(value)),
  }));

  return (
    <DropdownMenu
      align="end"
      trigger={(triggerProps) => (
        <IconButton
          label={t("ariaLabel", { mode: t(mode) })}
          icon={resolvedDark ? <MoonIcon /> : <SunIcon />}
          {...triggerProps}
        />
      )}
      items={items}
    />
  );
}
