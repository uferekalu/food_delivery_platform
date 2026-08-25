import * as Sentry from "@sentry/nextjs";

// Browser-side counterpart to instrumentation.ts's register() — same no-op-until-configured
// reasoning as sentry.server.config.ts (docs/ROADMAP.md FDP-22).
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
