import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
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
import { StoreProvider } from "@/lib/redux/store-provider";
import { ThemeInitializer } from "@/components/theme-initializer";
import { SessionInitializer } from "@/components/session-initializer";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// This is still the TRUE root layout — <html>/<body> and the shared header/footer chrome — even
// though it's also i18n-aware now (docs/ROADMAP.md FDP-55). dashboard/admin/rider deliberately
// stay outside app/[locale] for this ticket's customer-facing-first scope, but they still render
// through this same layout, so it must keep working for them too: getLocale() falls back to the
// default locale ('en') for any route the i18n middleware didn't touch, and
// NextIntlClientProvider wraps every route (not just [locale] ones) so shared chrome components
// (MobileNav, AuthStatus, etc.) can safely call useTranslations() regardless of which kind of
// page rendered them.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Layout");
  const title = t("siteTitle");
  const description = t("siteDescription");
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${title}` },
    description,
    openGraph: { type: "website", siteName: title, title, description },
    twitter: { card: "summary", title, description },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations("Layout");

  return (
    <html lang={locale} className={`${inter.variable} antialiased`} suppressHydrationWarning>
      <body className="flex flex-col bg-surface text-text">
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <StoreProvider>
            <ThemeInitializer />
            <SessionInitializer />
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
          </StoreProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
