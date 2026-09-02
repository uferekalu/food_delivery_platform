import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

// Nested layout for every customer-facing route (docs/ROADMAP.md FDP-55) — the true root layout
// (src/app/layout.tsx) still owns <html>/<body> and the shared header/footer chrome, since
// dashboard/admin/rider stay outside [locale] for now and need that chrome too. This layout's
// only job is validating the URL's locale segment and enabling static rendering for it.
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

  return children;
}
