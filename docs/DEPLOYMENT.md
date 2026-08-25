# Deployment

Backend deploys to **Render**, frontend to **Vercel** (see `docs/ARCHITECTURE.md` §1 for why
these are two independent deploys, not a monorepo build). This doc covers the one-time manual
setup neither `render.yaml` nor CI can do on its own — creating the actual hosted projects and
filling in real secret values requires a human with dashboard access.

## Backend — Render

1. In the Render dashboard, **New > Blueprint**, point it at this repo. Render reads
   `render.yaml` at the repo root and creates the `food-delivery-platform-api` web service with
   `rootDir: backend` — every other setting (build/start commands, health check path) comes from
   that file already.
2. Fill in every env var `render.yaml` lists with `sync: false` — these are never committed
   (see `backend/.env.example` for what each one is and where to get it). `TERMII_*` and
   `SENTRY_DSN` are optional; leave them blank until those accounts actually exist and the app
   degrades gracefully (no SMS / no error reporting) rather than failing to boot.
3. `MONGODB_URI` should point at a real MongoDB Atlas cluster (see `.env.example`'s comment) —
   never the local dev database.
4. `CORS_ORIGINS` and `FRONTEND_URL` must be the real deployed frontend URL (the Vercel
   production domain from the section below), not `http://localhost:3000`.
5. After the first successful deploy, run the admin bootstrap once against the production
   database: `npm run seed:admin -- you@example.com` (see `backend/CLAUDE.md`) — from a
   machine with `MONGODB_URI` pointed at the production cluster, since this is a one-off script,
   not something Render runs automatically.

## Frontend — Vercel

No `vercel.json` is committed — this is a standard Next.js App Router project, and Vercel's
zero-config detection handles the build/output settings on its own. What still needs manual
setup in the Vercel dashboard when creating the project:

1. **Root Directory**: set to `frontend` (this repo is not a single-app repo — see
   `docs/ARCHITECTURE.md` §1).
2. **Environment variables** — every `NEXT_PUBLIC_*` var in `frontend/.env.example`:
   - `NEXT_PUBLIC_API_URL` — the deployed Render backend's URL.
   - `NEXT_PUBLIC_SITE_URL` — this Vercel deployment's own production URL (used for canonical/OG
     metadata, `sitemap.xml`, `robots.txt` — docs/ROADMAP.md FDP-21). Update this once the real
     production domain is known; the sitemap/robots routes read it at request time, not build
     time, so this can be corrected after the first deploy without a rebuild.
   - `NEXT_PUBLIC_MAPBOX_TOKEN` and `NEXT_PUBLIC_SENTRY_DSN` are optional — leave blank until
     those accounts exist (map tracking / error reporting simply stay off, same as Termii on the
     backend).
3. Once both are live, go back to the Render service and update `CORS_ORIGINS`/`FRONTEND_URL` to
   the real Vercel domain (step 4 above) — there's a real chicken-and-egg order here since each
   side's config wants to know the other's final URL.

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: backend (lint, build, unit tests,
e2e tests) and frontend (lint, test, build) as two independent jobs. This is a **build/test
gate only** — it does not deploy anything. Render and Vercel each have their own GitHub
integration (configured once, in their respective dashboards during project creation) that
redeploys automatically on a push to `main`, independent of this workflow.

## Error tracking (Sentry)

Both apps are Sentry-ready but not Sentry-configured (docs/ROADMAP.md FDP-22) — no Sentry
project exists for this app yet. Wiring is already in place:
- Backend: `Sentry.init()` in `main.ts`, `AllExceptionsFilter` reports every 5xx.
- Frontend: `instrumentation.ts` (server/edge) + `instrumentation-client.ts` (browser), Next's
  own conventions for this.

Both are strict no-ops until `SENTRY_DSN` (backend) / `NEXT_PUBLIC_SENTRY_DSN` (frontend) are
set to a real DSN from a Sentry project — create one, add the two env vars in their respective
dashboards, and error tracking turns on with no code changes.
