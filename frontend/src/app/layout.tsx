import type { Metadata } from "next";
import { Inter } from "next/font/google";
import NextLink from "next/link";
import Script from "next/script";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AuthStatus } from "@/components/auth-status";
import { MobileNav } from "@/components/mobile-nav";
import { CartDrawer } from "@/components/cart-drawer";
import { NotificationBell } from "@/components/notification-bell";
import { HeaderSearch } from "@/components/header-search";
import { Logo } from "@/components/logo";
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
const DEFAULT_DESCRIPTION =
  "Order from local restaurants and track your delivery live, from checkout to your door.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Food Delivery Platform",
    template: "%s | Food Delivery Platform",
  },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Food Delivery Platform",
    title: "Food Delivery Platform",
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "Food Delivery Platform",
    description: DEFAULT_DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`} suppressHydrationWarning>
      <body className="flex flex-col bg-surface text-text">
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        <StoreProvider>
          <ThemeInitializer />
          <SessionInitializer />
          <ToastProvider>
            <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-surface">
              <Container className="flex flex-wrap items-center gap-3 py-3">
                <NextLink href="/restaurants" className="flex shrink-0 items-center gap-2 text-sm font-semibold text-primary">
                  <Logo className="size-8" />
                  Restaurants
                </NextLink>
                {/* Full-width row of its own below `sm` (order-3 + w-full forces the wrap);
                    a normal flex-1 middle column at `sm` and up — see frontend/CLAUDE.md
                    "Responsive design" and docs/ROADMAP.md FDP-46. */}
                <HeaderSearch className="order-3 w-full sm:order-0 sm:w-auto sm:max-w-md sm:flex-1" />
                <div className="ml-auto flex items-center gap-2">
                  <NotificationBell />
                  <CartDrawer />
                  <div className="hidden items-center gap-3 sm:flex">
                    <AuthStatus />
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
      </body>
    </html>
  );
}
