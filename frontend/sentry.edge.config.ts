import * as Sentry from "@sentry/nextjs";

// See sentry.server.config.ts — same no-op-until-configured reasoning, for the edge runtime.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
