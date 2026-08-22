# Food Delivery Platform

Technology-driven food ordering and delivery platform connecting customers with restaurants
and reliable delivery. Full product spec: `docs/PRODUCT_GUIDE.md`. Technical architecture:
`docs/ARCHITECTURE.md`. Phased build plan: `docs/ROADMAP.md`. Detailed rules:
`docs/ENGINEERING_RULES.md`. Read these before starting work in an unfamiliar area — this file
is only the summary.

## Stack

- **Backend** (`backend/`): NestJS, TypeScript, MongoDB (Mongoose), Cloudinary, Socket.IO,
  Stripe + Paystack + Flutterwave. Deployed to **Render**.
- **Frontend** (`frontend/`): Next.js (App Router), TypeScript, Tailwind CSS, hand-built UI kit
  on top of design tokens (no Radix/shadcn), Redux Toolkit + RTK Query for all state. Supports
  light/dark theming (token-driven, see `docs/ARCHITECTURE.md` §7). Deployed to **Vercel**.
- Two independent apps, no workspace tooling — see `docs/ARCHITECTURE.md` §1 for why.

## Brand

Primary color: **burgundy**. Secondary/surface: **white/neutral**. Full token scale in
`frontend/src/styles/tokens.css` (source of truth) and `frontend/src/styles/tokens.ts` (typed
accessors) — never hardcode brand colors in components.

## Non-negotiable rules

1. **Never push directly to `main`/`master`.** Every change goes on
   `feature/FDP-<number>-<short-description>`, pushed, then opened as a PR against `main`. As
   of 2026-08-17, Claude merges these PRs itself (squash, delete branch) rather than leaving
   them for manual review — see `docs/ENGINEERING_RULES.md` for the full standing instruction
   and why. Next ticket number is tracked at the top of `docs/ROADMAP.md`.
2. **No secrets committed.** Ever. Real values live in local `.env` (gitignored) or in
   Vercel/Render project settings. Document required vars in `.env.example`.
3. **No hardcoded design values in the frontend.** Colors/spacing/type/radius come from
   `frontend/src/styles/tokens.ts`. If a needed value isn't a token, add it there first.
4. **Payment state changes only from verified server-side events** (webhook signature
   verified, or an authenticated verify() call) — never trust a client-reported "payment
   succeeded".
5. **Every endpoint validates input via a DTO; every form validates via Zod.** No raw
   `req.body` access, no un-validated form submits.
6. Full rule set, testing gates, and accessibility requirements: `docs/ENGINEERING_RULES.md`.

## Repo structure

```
backend/     NestJS API — see backend/CLAUDE.md
frontend/    Next.js app — see frontend/CLAUDE.md
docs/        Product guide, architecture, roadmap, engineering rules
.claude/     Project skills (e.g. new-feature-branch)
```
