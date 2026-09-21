# Food Delivery Platform

A technology-driven food ordering and delivery platform connecting customers with restaurants,
grocery/pharmacy stores, and reliable delivery riders — built to compete with modern platforms
like Uber Eats, DoorDash, and Glovo, with first-class support for African payment rails
(Paystack, Flutterwave) alongside global card payments (Stripe).

**Live:**
- Frontend: https://frontend-omega-five-83.vercel.app
- Backend API health check: https://food-delivery-platform-api-production.up.railway.app/health

## Table of contents

- [What this is](#what-this-is)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started (local development)](#getting-started-local-development)
- [Environment variables](#environment-variables)
- [Testing](#testing)
- [Deployment](#deployment)
- [Documentation map](#documentation-map)
- [Branching & contribution workflow](#branching--contribution-workflow)

## What this is

Four user roles share one platform:

| Role | Can do |
|---|---|
| **Customer** | Browse restaurants and grocery/pharmacy stores, order, pay (Stripe/Paystack/Flutterwave), track delivery live on a map, reorder, rate restaurants/stores/riders, save favorites |
| **Restaurant/store owner** | Manage menu or product catalog, opening hours, incoming order queue in real time, delivery zones, promo codes, sponsored-listing ad campaigns, payouts/sales reports, assign/contact delivery riders |
| **Rider** | Apply with KYC documents, go online and share live location, accept/manage deliveries, see earnings and payout history |
| **Admin** | Approve restaurants/stores/riders, manage users, resolve disputes and refunds, run the weekly payout batch, view platform-wide analytics and a transactions ledger, manage promo codes and the support knowledge base |

The full, ticket-by-ticket build history is in [`docs/ROADMAP.md`](docs/ROADMAP.md); the *why*
behind every non-obvious decision is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Tech stack

**Backend** (`backend/`) — NestJS + TypeScript, MongoDB via Mongoose, Passport JWT (access +
refresh token rotation), Socket.IO for realtime order/chat updates, Cloudinary for media,
Stripe + Paystack + Flutterwave SDKs (auto-selected by currency, manual override available),
class-validator/class-transformer DTOs on every endpoint, `@nestjs/throttler` rate limiting,
Helmet, Swagger API docs, Sentry error tracking, Resend for transactional email, Termii for SMS,
web-push for browser push notifications, `migrate-mongo` for schema migrations, Jest for unit and
e2e tests. Deployed to **Railway**.

**Frontend** (`frontend/`) — Next.js (App Router) + TypeScript, Tailwind CSS on top of a
hand-built, token-driven design system (no Radix/shadcn), Redux Toolkit + RTK Query as the single
state layer, React Hook Form + Zod for every form, Socket.IO client, Mapbox GL for live delivery
tracking, `next-intl` for i18n (6 languages: English, German, Spanish, French, Portuguese,
Chinese), Vitest + React Testing Library for component tests. Deployed to **Vercel**.

Both apps are two **independent** deployments with their own `package.json`/lockfile — there is
no npm/pnpm workspace tooling, because they build and deploy to different hosts. See
[`docs/ARCHITECTURE.md` §1](docs/ARCHITECTURE.md) for the full reasoning.

## Repository layout

```
food_ordering_platform/
  backend/       NestJS API — see backend/CLAUDE.md for backend-specific conventions
  frontend/      Next.js app — see frontend/CLAUDE.md for frontend-specific conventions
  docs/
    PRODUCT_GUIDE.md       What this product is, who it's for, full feature set
    ARCHITECTURE.md        Technical source of truth — domain model, every non-obvious
                            design decision, and a numbered log of every shipped ticket
    ROADMAP.md              Phased build order, one row per ticket, next ticket number
    ENGINEERING_RULES.md    Branching/PR rules, code quality gates, accessibility, secrets
    DEPLOYMENT.md            Live URLs, one-time hosting setup, CI, backups, error tracking
  .claude/skills/  Project-specific Claude Code skills (e.g. new-feature-branch)
  render.yaml      Alternative Render deploy config (Railway is the current live host)
  CLAUDE.md        Root conventions read at the start of every AI-assisted session
```

## Getting started (local development)

Prerequisites: Node.js, a local or Atlas MongoDB instance, and copies of both `.env.example`
files filled in (see [Environment variables](#environment-variables) below — most third-party
integrations are optional and degrade gracefully when unset).

```bash
# Backend
cd backend
npm install
cp .env.example .env        # fill in MONGODB_URI at minimum
npm run start:dev           # watch mode, http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env.local  # NEXT_PUBLIC_API_URL should point at the backend above
npm run dev                 # http://localhost:3000
```

The very first admin account has to be bootstrapped outside the API (registering through the UI
only ever creates `customer`/`restaurant_owner` accounts — see
[`backend/CLAUDE.md`](backend/CLAUDE.md)):

```bash
# Register a normal account through the app first, then:
cd backend
npm run seed:admin -- you@example.com
```

## Environment variables

Every required and optional variable is documented inline in each app's `.env.example` — that's
the source of truth, not this file:

- [`backend/.env.example`](backend/.env.example) — database, JWT secrets, email (Resend),
  Cloudinary, the three payment providers, Termii SMS, Sentry, Google/Facebook OAuth, web push
  (VAPID), the LLM-backed support chatbot (Anthropic), and Youverify business verification.
- [`frontend/.env.example`](frontend/.env.example) — the backend API URL, Mapbox, this app's own
  public URL (for metadata/sitemap), and Sentry.

Most third-party integrations (SMS, Sentry, OAuth, push, the chatbot's LLM layer, business
verification) are **optional** and degrade gracefully to a no-op or a manual fallback when left
unset — nothing fails to boot because a non-essential key is missing. Never commit real values;
they live in a local, gitignored `.env`/`.env.local` or in the Railway/Vercel project settings.

## Testing

```bash
# Backend
cd backend
npm run test        # unit tests (Jest)
npm run test:e2e     # end-to-end tests against a real Mongo instance
npm run test:cov     # coverage

# Frontend
cd frontend
npm run test         # component tests (Vitest + React Testing Library)
npm run lint
npx tsc --noEmit
npm run build         # production build — the strongest overall correctness check
```

Both apps also have a GitHub Actions workflow (`.github/workflows/ci.yml`) that runs lint, build,
and tests on every push/PR to `main` — a build/test gate only, it does not deploy anything (see
below).

## Deployment

Full one-time hosting setup, the live URLs, CI behavior, database backups, and error-tracking
setup all live in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Short version:

- **Backend** auto-deploys to **Railway** on every push to `main`.
- **Frontend** auto-deploys to **Vercel** via its GitHub integration on every push to `main`. If
  that integration ever breaks, the manual fallback is `npx vercel --prod --yes` run from the
  **repository root** (not `frontend/` — the Vercel CLI resolves the deploy source as
  `<cwd> + <Root Directory>`, and the project's Root Directory is already set to `frontend`).
- Any change touching `backend/migrations/` needs an explicit `npm run migrate:up` against the
  production database after deploy — migrations do not run automatically.

## Documentation map

Read these in this order when working in an unfamiliar area:

1. [`docs/PRODUCT_GUIDE.md`](docs/PRODUCT_GUIDE.md) — what the product is and who it's for.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the technical source of truth: domain model,
   payment routing, auth, realtime, theming, and a numbered, chronological log of every shipped
   ticket's design decisions and why they were made that way.
3. [`docs/ROADMAP.md`](docs/ROADMAP.md) — the phased build order, one row per ticket.
4. [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md) — branching/PR rules, code quality
   gates, accessibility requirements, secrets handling.
5. [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — hosting setup and live URLs.
6. `backend/CLAUDE.md` / `frontend/CLAUDE.md` — conventions specific to each app.

## Branching & contribution workflow

Never push directly to `main`. Every change goes on a
`feature/FDP-<number>-<short-description>` branch, opened as a PR against `main`. The next
available ticket number is tracked at the top of `docs/ROADMAP.md`. See
[`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md) for the full rule set, including code
quality gates that must pass before a branch is considered done (lint, type-check, tests, a
production build, and — for anything touching payments, auth, or destructive operations — a
security-focused review pass).
