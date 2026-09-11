"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRef, useTransition, type ChangeEvent } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { isOutOfScopePath } from "@/i18n/scope";
import { cn } from "@/lib/cn";

const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English (EN)",
  fr: "Français (FR)",
  es: "Español (ES)",
  pt: "Português (PT)",
  de: "Deutsch (DE)",
  zh: "中文 (ZH)",
};

// Just the language's own name, no "(CODE)" suffix — used in `compact` mode (the header, where
// space is at a premium) so the closed control reads as a normal-width word instead of a fixed
// ~144px box; the full "Name (CODE)" form is kept for the mobile drawer, which has room to spare
// and benefits from the explicit code for anyone unsure which name maps to which language.
const LOCALE_LABELS_COMPACT: Record<AppLocale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  pt: "Português",
  de: "Deutsch",
  zh: "中文",
};

/** Swaps locale while staying on the same page (docs/ROADMAP.md FDP-55/FDP-70). A native
 * `<select>`, not the hand-built `Select` component — the latter portals its listbox at
 * `--z-dropdown`, which renders invisibly/unclickably when this control sits inside
 * `MobileNav`'s `Drawer` (`--z-modal`'s backdrop paints over it regardless of DOM order, the
 * exact bug documented in frontend/CLAUDE.md's "Never nest a DropdownMenu-based control inside
 * Modal/Drawer"). A native select has no portal, so it works identically in the header and the
 * drawer, and gets the platform's native picker UI on mobile for free.
 *
 * This renders on every page, including the `@/i18n/scope` out-of-scope trees (dashboard/admin/
 * rider/design-system) that don't exist under `app/[locale]` yet — `pathname` there is a real
 * path with no locale-prefixed counterpart, so blindly calling `router.replace(pathname,
 * {locale})` 404'd (docs/ROADMAP.md FDP-70 bug report). On those routes this instead sends the
 * visitor to the chosen locale's homepage, the one page guaranteed to exist in every locale.
 *
 * Guarded against rapid/repeated selection (docs/ROADMAP.md FDP-71) — a second `onChange`
 * firing before the first navigation has actually landed could otherwise race against a
 * `pathname`/`locale` that's already mid-transition and produce a malformed URL (the
 * `/fr/fr/register` class of bug this ticket's sibling fix addressed for the *stale-context*
 * case; this closes the *rapid-input* case the same bug class could reopen). `navigatingRef` is
 * a synchronous guard checked before React even re-renders — `isPending`/`disabled` alone would
 * leave a brief window between the click and the DOM actually reflecting `disabled`. */
export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  /** Short "English" instead of "English (EN)" — the header's own header-decluttering pass
   * (docs/ROADMAP.md FDP-122), not used in the mobile drawer, which has room for the full form. */
  compact?: boolean;
}) {
  const t = useTranslations("Layout");
  const labels = compact ? LOCALE_LABELS_COMPACT : LOCALE_LABELS;
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const navigatingRef = useRef(false);

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const nextLocale = e.target.value as AppLocale;
    if (nextLocale === locale || navigatingRef.current) return;
    navigatingRef.current = true;

    startTransition(() => {
      if (isOutOfScopePath(pathname)) {
        router.replace("/", { locale: nextLocale });
      } else {
        router.replace(pathname, { locale: nextLocale });
      }
      // The locale-driven remount of app/[locale]/layout.tsx (or the untranslated equivalent)
      // unmounts this component entirely once the navigation lands, so there's no "reset to
      // false" step to forget — this ref simply never outlives a completed switch.
    });
  }

  return (
    <select
      aria-label={t("languageSwitcherLabel")}
      value={locale}
      onChange={handleChange}
      disabled={isPending}
      className={cn(
        "h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-text",
        "transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {routing.locales.map((option) => (
        <option key={option} value={option}>
          {labels[option]}
        </option>
      ))}
    </select>
  );
}
