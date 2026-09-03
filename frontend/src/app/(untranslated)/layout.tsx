import { NextIntlClientProvider } from "next-intl";
import { AppShell } from "@/components/app-shell";
import enMessages from "../../../messages/en.json";

// admin/rider/design-system stay English-only for now (docs/ROADMAP.md FDP-55/FDP-70's
// customer-facing-first, then-dashboard scope — dashboard moved in-scope in FDP-70, these three
// are still future tickets). A route group (no URL segment) rather than a real path prefix, so
// /admin, /rider, and /design-system are unaffected. Static English messages, not a per-request
// fetch — these routes never change locale, so there's nothing to resolve per request. Still
// needs its own NextIntlClientProvider (not just a fallback in the shared AppShell) because
// AppShell's client-side children (AuthStatus, LanguageSwitcher, etc.) call useTranslations(),
// which reads React context, not the server-side request-scoped locale.
export default function UntranslatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AppShell>{children}</AppShell>
    </NextIntlClientProvider>
  );
}
