# Roadmap

Phased build order. Each phase is one `feature/FDP-<n>-<description>` branch, pushed as a PR
against `main` and merged (see `docs/ENGINEERING_RULES.md` for the current branch/PR/merge
workflow — nothing is ever pushed directly to `main`).

**Next available ticket number: FDP-6**

Update the number above every time a new ticket branch is created (the
`new-feature-branch` skill in `.claude/skills/` reads this file to pick the next number).

## Phases

| # | Branch suffix | Scope | Status |
|---|---|---|---|
| FDP-1 | `foundation-docs` | Product guide, architecture doc, roadmap, engineering rules, root CLAUDE.md, branch-creation skill | ✅ Done |
| FDP-2 | `frontend-design-system` | Next.js app scaffold, Tailwind config, design tokens, full hand-built UI kit + component showcase page | ✅ Done |
| FDP-3 | `backend-foundation` | NestJS app scaffold, config/env validation, MongoDB connection, health check, logging, error handling, Swagger | ✅ Done |
| FDP-4 | `auth` | Backend auth (register/login/refresh/verify/reset, role guards) + frontend auth pages/session handling | ✅ Done |
| FDP-5 | `restaurants-menu` | Restaurant + menu CRUD (backend), Cloudinary uploads, customer browse/menu pages **+ restaurant owner dashboard** (create/edit restaurant, manage menu) — folded in because no later phase owns this UI | ✅ Done |
| FDP-6 | `cart-checkout` | Cart persistence (backend), cart/checkout UI (frontend) | ⬜ Not started |
| FDP-7 | `orders-realtime` | Order state machine, Socket.IO gateway, order tracking UI with status stepper | ⬜ Not started |
| FDP-8 | `payments` | Stripe/Paystack/Flutterwave adapters, provider resolver, webhooks, checkout payment UI | ⬜ Not started |
| FDP-9 | `delivery-rider-tracking` | Rider dashboard, delivery assignment, live Mapbox tracking | ⬜ Not started |
| FDP-10 | `reviews-ratings` | Restaurant + rider reviews/ratings | ⬜ Not started |
| FDP-11 | `notifications` | Email + in-app notifications | ⬜ Not started |
| FDP-12 | `admin-dashboard` | Admin approval workflows, dispute/refund handling, platform analytics | ⬜ Not started |
| FDP-13 | `search-performance-seo` | Search/filtering, performance passes, SEO | ⬜ Not started |
| FDP-14 | `deployment-cicd` | Vercel + Render deploy configs, GitHub Actions CI/CD, final security review | ⬜ Not started |

Phases are sequential but not rigid — if a later phase's work is discovered while doing an
earlier one, note it here rather than scope-creeping the current branch.
