"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LOCALE_LABELS: Record<string, string> = { en: "EN", fr: "FR" };

/** Swaps locale while staying on the same page (docs/ROADMAP.md FDP-55) — a plain segmented
 * control, not a DropdownMenu, so it works inline in both the desktop header and MobileNav's
 * drawer without the portal-stacking issue documented in frontend/CLAUDE.md. */
export function LanguageSwitcher() {
  const t = useTranslations("Layout");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div role="radiogroup" aria-label={t("languageSwitcherLabel")} className="flex gap-1 rounded-md bg-secondary p-1">
      {routing.locales.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={locale === option}
          onClick={() => router.replace(pathname, { locale: option })}
          className={`rounded px-2 py-1 text-xs font-medium transition-colors duration-150 ${
            locale === option ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"
          }`}
        >
          {LOCALE_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
