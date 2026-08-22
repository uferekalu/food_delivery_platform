# Roadmap

Phased build order. Each phase is one `feature/FDP-<n>-<description>` branch, pushed as a PR
against `main` and merged (see `docs/ENGINEERING_RULES.md` for the current branch/PR/merge
workflow — nothing is ever pushed directly to `main`).

**Next available ticket number: FDP-21**

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
| FDP-6 | `platform-hardening` | Responsive design retrofit (mobile-first audit + fixes across every existing page/UI-kit component), Redux session reauth-on-401 (silent refresh-and-retry, matching the RTK Query official pattern), responsive header/mobile nav, viewport/touch-target fixes found via audit — inserted ahead of feature work because it closes gaps in already-agreed `PRODUCT_GUIDE.md` requirements (responsive/accessible UI) that shipped incompletely in FDP-1–5 | ✅ Done |
| FDP-7 | `frontend-testing-infra` | Vitest + React Testing Library setup, component tests for the interactive/stateful UI kit primitives (Button, Modal, DropdownMenu, Tabs, Pagination, form controls) — closes the "component tests (UI kit)" commitment in `PRODUCT_GUIDE.md` that had no test framework in place at all | ✅ Done |
| FDP-8 | `visual-polish-branding` | Real UX review findings from live use of FDP-1–7: dark-mode contrast bug fixed at the token level (raw `neutral-*` classes never had a dark override — added `--color-secondary(-hover/-active)` semantic tokens, fixed every consumer), password show/hide toggle on `Input`, mobile nav rebuilt from a `Modal` to a proper slide-in `Drawer` (the old approach nested a portal-based `DropdownMenu` inside a `Modal` — z-index layering made the theme toggle inside it effectively unusable), custom themed scrollbar, footer, hand-designed logo mark + favicon | ✅ Done |
| FDP-9 | `menu-modifiers-ui` | Full `docs/PRODUCT_GUIDE.md` audit against everything shipped in FDP-1–8: menu item modifiers/options had backend schemas + frontend types since FDP-5 but **no UI on either side** — owner dashboard gets modifier group/option management (nested react-hook-form field arrays) plus a proper item-edit flow (item editing existed on the backend/RTK-Query layer but had no UI either), customer storefront gets a read-only modifier display. Also fixes stale docs (root `CLAUDE.md` still described the pre-2026-08-17 manual-PR-review workflow) and gives explicit roadmap ownership to requirements `PRODUCT_GUIDE.md` listed but no ticket claimed (see FDP-12 and FDP-20 below) | ✅ Done |
| FDP-10 | `cart` | Cart persistence (backend `Cart` schema/CRUD, one active restaurant per cart), customer-facing modifier selection UI (item detail modal — required/optional groups, quantity, notes), cart drawer (reusing FDP-8's `Drawer`). Split out of the original combined "cart-checkout" ticket — cart alone (backend + item-selection UI + drawer) is a full phase on its own; checkout/order-creation/promo-codes moved to FDP-11 so each PR stays reviewable | ✅ Done |
| FDP-11 | `checkout` | Checkout form (inline delivery address entry, delivery instructions, ASAP vs. scheduled — native `<input type="datetime-local">`, matching the native-input precedent already set for opening-hours time fields rather than a custom DatePicker component), promo/coupon code redemption (**new `PromoCode` schema** — gap found against `PRODUCT_GUIDE.md`'s "modern platform" bar, no other phase owns it), order creation (`Order` in `PENDING_PAYMENT` status per `docs/ARCHITECTURE.md` §3 — real payment processing is FDP-14, this phase only creates the order and resolves the default provider), order confirmation + basic order history list | ✅ Done |
| FDP-12 | `customer-account` | Standalone profile management (name/email/password/avatar) and saved-addresses list (reusing the `Address` shape FDP-11 introduces inline at checkout), **favorites/saved restaurants** — both listed in `PRODUCT_GUIDE.md` §4 but had no owning ticket until the FDP-9 audit added one | ⬜ Not started |
| FDP-13 | `orders-realtime` | Order state machine (status transitions beyond the `PENDING_PAYMENT` FDP-11 creates orders in), Socket.IO gateway, order tracking UI with status stepper, restaurant owner's live order queue (accept/reject/prepare/ready) | ⬜ Not started |
| FDP-14 | `payments` | Stripe/Paystack/Flutterwave adapters, provider resolver, webhooks, checkout payment UI — this is what actually moves an order out of `PENDING_PAYMENT` | ⬜ Not started |
| FDP-15 | `delivery-rider-tracking` | Rider dashboard, delivery assignment, live Mapbox tracking, **real `DeliveryZone`-based delivery fee calculation** (FDP-11's checkout uses a simple flat-fee placeholder — replace it here once geo/zone data exists) | ⬜ Not started |
| FDP-16 | `reviews-ratings` | Restaurant + rider reviews/ratings | ⬜ Not started |
| FDP-17 | `notifications` | Email + in-app + **SMS notifications (Termii)** | ⬜ Not started |
| FDP-18 | `admin-dashboard` | Admin approval workflows, dispute/refund handling, platform analytics, **promo code management UI** (creation is API-only from FDP-11 onward, same bootstrap pattern as restaurant approval before FDP-5's owner dashboard existed) | ⬜ Not started |
| FDP-19 | `search-performance-seo` | Search/filtering (cuisine/price/rating/delivery-time/sort — the backend DTO only supports text search + cuisine today), performance passes, SEO | ⬜ Not started |
| FDP-20 | `deployment-cicd` | Vercel + Render deploy configs, GitHub Actions CI/CD, final security review, **error-tracking hook (Sentry-ready)** — listed in `PRODUCT_GUIDE.md`'s Observability requirements but had no owning ticket until the FDP-9 audit added one; paired with deployment since that's when a real Sentry DSN gets wired into Vercel/Render env vars, **PWA manifest/installability** (candidate addition — lightweight "add to home screen" support, distinct from the out-of-scope native app per `PRODUCT_GUIDE.md` §5; confirm before building) | ⬜ Not started |

Phases are sequential but not rigid — if a later phase's work is discovered while doing an
earlier one, note it here rather than scope-creeping the current branch.
