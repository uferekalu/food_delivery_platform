import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { getLocale, getTranslations } from "next-intl/server";
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

// The TRUE root layout — <html>/<body> only. It deliberately owns NO header/footer chrome and
// NO NextIntlClientProvider (docs/ROADMAP.md FDP-70) — this layout has no dynamic segment of
// its own, so Next.js never re-renders it on a client-side navigation that only changes the
// [locale] segment below it. Putting locale-dependent chrome here was the root cause of a real
// bug: switching languages updated the URL but the header/page kept rendering the *previous*
// locale's translations (or, worse, corrupted the locale-prefix logic into a double-prefixed
// 404) because `useLocale()`/translations were frozen at whatever locale the page first loaded
// with. The chrome now lives in `AppShell`, rendered separately by `app/[locale]/layout.tsx`
// (translated routes) and `app/(untranslated)/layout.tsx` (admin/rider/design-system) — each
// nested under a layout that *does* re-render per navigation, wrapped in its own
// NextIntlClientProvider. StoreProvider/ThemeInitializer/SessionInitializer stay here instead of
// down in those layouts specifically because they must NOT remount on a locale switch — that
// would reset cart/auth/theme state every time someone changes the language.
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

  return (
    <html lang={locale} className={`${inter.variable} antialiased`} suppressHydrationWarning>
      <body className="flex flex-col bg-surface text-text">
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        <StoreProvider>
          <ThemeInitializer />
          <SessionInitializer />
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
