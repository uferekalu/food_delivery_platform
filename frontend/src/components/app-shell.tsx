import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AuthStatus } from "@/components/auth-status";
import { MobileNav } from "@/components/mobile-nav";
import { CartDrawer } from "@/components/cart-drawer";
import { NotificationBell } from "@/components/notification-bell";
import { HeaderSearch } from "@/components/header-search";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Footer } from "@/components/footer";
import { Container } from "@/components/ui/container";

/**
 * The shared header/footer chrome, rendered by both `app/[locale]/layout.tsx` (translated
 * routes) and `app/(untranslated)/layout.tsx` (admin/rider/design-system, still English-only) —
 * each wraps this in its own `NextIntlClientProvider` with the right `locale`/`messages` before
 * rendering it. This used to live directly in the true root `app/layout.tsx`, but that layout
 * has no dynamic segment of its own, so Next.js never re-renders it on a client-side navigation
 * that only changes the `[locale]` segment — `useLocale()`/translations inside it stayed frozen
 * at whatever locale the page was first loaded with, which is what caused switching languages to
 * visually "do nothing" (or corrupt the locale-prefix logic into a double-prefixed URL) rather
 * than actually translating (docs/ROADMAP.md FDP-70). Moving this chrome into a layout that
 * *does* re-render per navigation — one nested under the `[locale]` dynamic segment — fixes it.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Layout");

  return (
    <ToastProvider>
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-surface">
        <Container className="flex flex-wrap items-center gap-3 py-3">
          {/* Logo alone is the "go home" control (docs/ROADMAP.md FDP-66) — it used to
              link to /restaurants with no separate way back to the homepage. Restaurants
              is now a normal nav link, alongside future routes in the same inline group;
              MobileNav's drawer carries the equivalent link below `sm`. */}
          <Link href="/" aria-label={t("homeAriaLabel")} className="flex shrink-0 items-center">
            <Logo className="size-8" />
          </Link>
          <nav className="hidden items-center gap-4 text-sm font-medium text-text sm:flex">
            <Link href="/restaurants" className="hover:text-primary">
              {t("restaurantsNavLink")}
            </Link>
          </nav>
          {/* Full-width row of its own below `sm` (order-3 + w-full forces the wrap);
              a normal flex-1 middle column at `sm` and up — see frontend/CLAUDE.md
              "Responsive design" and docs/ROADMAP.md FDP-46. */}
          <HeaderSearch className="order-3 w-full sm:order-0 sm:w-auto sm:max-w-md sm:flex-1" />
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <CartDrawer />
            <div className="hidden items-center gap-3 sm:flex">
              <AuthStatus />
              <LanguageSwitcher className="w-36" />
              <ThemeToggle />
            </div>
            <MobileNav />
          </div>
        </Container>
      </header>
      <div className="flex-1">{children}</div>
      <Footer />
    </ToastProvider>
  );
}
