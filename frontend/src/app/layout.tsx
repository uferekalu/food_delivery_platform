import type { Metadata } from "next";
import { Inter } from "next/font/google";
import NextLink from "next/link";
import Script from "next/script";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AuthStatus } from "@/components/auth-status";
import { MobileNav } from "@/components/mobile-nav";
import { CartDrawer } from "@/components/cart-drawer";
import { Logo } from "@/components/logo";
import { Footer } from "@/components/footer";
import { StoreProvider } from "@/lib/redux/store-provider";
import { ThemeInitializer } from "@/components/theme-initializer";
import { SessionInitializer } from "@/components/session-initializer";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Food Delivery Platform",
    template: "%s | Food Delivery Platform",
  },
  description:
    "Technology-driven food ordering and delivery platform connecting customers with restaurants and reliable delivery.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-surface text-text">
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        <StoreProvider>
          <ThemeInitializer />
          <SessionInitializer />
          <ToastProvider>
            <header className="sticky top-0 z-[var(--z-sticky)] flex items-center justify-between gap-3 border-b border-border bg-surface p-3">
              <NextLink href="/restaurants" className="flex shrink-0 items-center gap-2 text-sm font-semibold text-primary">
                <Logo className="size-8" />
                Restaurants
              </NextLink>
              <div className="flex items-center gap-2">
                <CartDrawer />
                <div className="hidden items-center gap-3 sm:flex">
                  <AuthStatus />
                  <ThemeToggle />
                </div>
                <MobileNav />
              </div>
            </header>
            <div className="flex-1">{children}</div>
            <Footer />
          </ToastProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
