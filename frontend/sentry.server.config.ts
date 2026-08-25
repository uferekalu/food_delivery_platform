import * as Sentry from "@sentry/nextjs";

// Only initialized when a real DSN exists (docs/ROADMAP.md FDP-22) — same graceful-degradation
// pattern as NEXT_PUBLIC_MAPBOX_TOKEN: no Sentry project exists for this app yet, so this stays
// a no-op until one is created and NEXT_PUBLIC_SENTRY_DSN is set in Vercel.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
