# Deployment

Frontend deploys to **Vercel**, backend to **Railway** (see `docs/ARCHITECTURE.md` §1 for why
these are two independent deploys, not a monorepo build). This doc covers the one-time manual
setup neither a config file nor CI can do on its own — creating the actual hosted projects and
filling in real secret values requires a human with dashboard access.

**Currently live at:**
- Frontend: `https://frontend-omega-five-83.vercel.app` — this is the actual public URL.
  `https://frontend-uferekalus-projects.vercel.app` also resolves to the same project but is
  gated behind Vercel's team SSO wall (an org-level Deployment Protection setting), so it only
  works for someone logged into the Vercel team — never link to it as "the app."
- Backend: `https://food-delivery-platform-api-production.up.railway.app`

## Backend — Railway (current host)

`render.yaml` at the repo root is still committed and works (see the Render section below) —
Railway is what's actually deployed today because Render started requiring a credit card even
for its free tier, which wasn't worth committing to before the app had been tested end-to-end.
Nothing about the app cares which host runs it; switching back to Render (or to Railway's paid
tier once this is validated) is just a redeploy, not a code change.

1. [railway.app](https://railway.app) → sign in with GitHub (no card required for the $5/30-day
   free trial) → **New Project** → **Deploy from GitHub repo** → select this repo.
2. In the service's **Settings** tab:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start:prod`
   - **Healthcheck Path**: `/health`
3. **Settings → Networking → Generate Domain** — Railway does not expose a public URL by
   default the way Render does; this step is easy to miss.
4. **Variables** tab — the same env var list `render.yaml` documents (see `backend/.env.example`
   for what each one is and where it comes from). `TERMII_*` and `SENTRY_DSN` are optional; leave
   them blank and the app degrades gracefully (no SMS / no error reporting) rather than failing
   to boot. Don't set `PORT` — Railway injects its own and the app already reads
   `process.env.PORT`. `CORS_ORIGINS` and `FRONTEND_URL` must both be **real, publicly-reachable**
   frontend URLs (see the SSO-gated-domain trap noted above) — a bad value here surfaces as
   `Config validation error: "FRONTEND_URL" must be a valid uri` in the deploy logs and crashes
   the app on every boot attempt, which shows up as a failing healthcheck with no obvious cause
   unless you check the *runtime* logs specifically (the build log looks completely fine).
5. After the first successful deploy, run the admin bootstrap once against the production
   database: `npm run seed:admin -- you@example.com` (see `backend/CLAUDE.md`) — from a machine
   with `MONGODB_URI` pointed at the production cluster, since this is a one-off script, not
   something Railway runs automatically.

## Backend — Render (documented alternative)

1. In the Render dashboard, **New > Blueprint**, point it at this repo. Render reads
   `render.yaml` at the repo root and creates the `food-delivery-platform-api` web service with
   `rootDir: backend` — every other setting (build/start commands, health check path) comes from
   that file already.
2. Fill in every env var `render.yaml` lists with `sync: false` — same list and same sourcing
   as the Railway section above.
3. `MONGODB_URI` should point at a real MongoDB Atlas cluster — never the local dev database.
4. `CORS_ORIGINS` and `FRONTEND_URL` must be the real deployed frontend URL, not
   `http://localhost:3000`.
5. Same `seed:admin` step as above.

## Frontend — Vercel

No `vercel.json` is committed — this is a standard Next.js App Router project, and Vercel's
zero-config detection handles the build/output settings on its own.

**A real CLI gotcha, if deploying locally rather than through Vercel's GitHub integration**: this
project's dashboard has **Root Directory** set to `frontend` (since this repo isn't a
single-app repo — see `docs/ARCHITECTURE.md` §1). The Vercel CLI resolves the deploy source as
`<cwd> + <Root Directory>` — so `.vercel/project.json` (created by `vercel link`) and every
`vercel`/`vercel --prod` invocation must happen from the **repo root**, not from inside
`frontend/`. Linking or deploying from inside `frontend/` produces a nonsensical
`frontend/frontend` path error. (This also means running `vercel link` without an existing
`.vercel` folder anywhere in the tree will offer to create a **new, wrong** project matching
whatever the current directory is named — always confirm which project you're linking to before
accepting.)

What still needs manual setup in the Vercel dashboard when creating the project (already done
for the one above):

1. **Root Directory**: `frontend`.
2. **Environment variables** — every `NEXT_PUBLIC_*` var in `frontend/.env.example`:
   - `NEXT_PUBLIC_API_URL` — the deployed backend's URL (Railway or Render, whichever is live).
   - `NEXT_PUBLIC_SITE_URL` — this Vercel deployment's own **public** production URL (used for
     canonical/OG metadata, `sitemap.xml`, `robots.txt` — docs/ROADMAP.md FDP-21). Double-check
     it isn't the SSO-gated domain (see the top of this doc) — that mistake silently breaks
     nothing at build time, it just means the sitemap and social-share links point somewhere
     visitors can't actually reach.
   - `NEXT_PUBLIC_MAPBOX_TOKEN` and `NEXT_PUBLIC_SENTRY_DSN` are optional — leave blank until
     those accounts exist (map tracking / error reporting simply stay off, same as Termii on the
     backend).
3. Once both sides are live, go back to the backend host and set `CORS_ORIGINS`/`FRONTEND_URL`
   to the real public Vercel domain — there's a genuine chicken-and-egg order here since each
   side's config wants to know the other's final URL. `CORS_ORIGINS` accepts a comma-separated
   list, which is the fix if you ever need to allow more than one frontend origin at once (e.g.
   both the gated and public Vercel domains, or a staging + production domain).

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: backend (lint, build, unit tests,
e2e tests) and frontend (lint, test, build) as two independent jobs. This is a **build/test
gate only** — it does not deploy anything. Vercel and the backend host each have their own
GitHub integration (configured once, in their respective dashboards during project creation)
that redeploys automatically on a push to `main`, independent of this workflow.

## Error tracking (Sentry)

Both apps are Sentry-ready but not Sentry-configured (docs/ROADMAP.md FDP-22) — no Sentry
project exists for this app yet. Wiring is already in place:
- Backend: `Sentry.init()` in `main.ts`, `AllExceptionsFilter` reports every 5xx.
- Frontend: `instrumentation.ts` (server/edge) + `instrumentation-client.ts` (browser), Next's
  own conventions for this.

Both are strict no-ops until `SENTRY_DSN` (backend) / `NEXT_PUBLIC_SENTRY_DSN` (frontend) are
set to a real DSN from a Sentry project — create one, add the two env vars in their respective
dashboards, and error tracking turns on with no code changes.
