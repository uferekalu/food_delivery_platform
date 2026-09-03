import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { AppShell } from "@/components/app-shell";
import { LocaleHtmlSync } from "@/components/locale-html-sync";

// Layout for every customer-facing route (docs/ROADMAP.md FDP-55/FDP-70) — this is the layout
// that actually owns NextIntlClientProvider now, specifically *because* it re-renders on every
// navigation where the `locale` param changes (unlike the true root `app/layout.tsx`, which has
// no dynamic segment and never re-renders on a client-side nav). See app/layout.tsx's comment
// for the full story of the bug this fixes.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LocaleHtmlSync />
      <AppShell>{children}</AppShell>
    </NextIntlClientProvider>
  );
}
