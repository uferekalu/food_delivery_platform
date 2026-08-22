# Food Delivery Platform — Product Guide

This is the description guide / source of truth for what this product is, who it's for, and
what it must do. Every feature built in this repo should trace back to something in this
document. When requirements change, update this file first, then build to match it.

## 1. Vision

A technology-driven food ordering and delivery platform connecting customers with restaurants
and reliable delivery, competitive with modern food delivery apps (e.g. Uber Eats, DoorDash,
Glovo, Chowdeck) — built for global reach with first-class support for African payment rails
(Paystack, Flutterwave) alongside global card payments (Stripe).

## 2. Brand

- **Primary color:** Burgundy (`#7A1F3D` family — full 50–950 tonal scale defined in
  `docs/ARCHITECTURE.md` §Design Tokens)
- **Secondary / surface color:** White / neutral grays
- **Tone:** Trustworthy, fast, warm — food is emotional, the UI should feel premium but not cold.
- **Typography:** A clean, highly-legible sans-serif for UI text, defined as a token (see
  Architecture doc) so it can be swapped without touching component code.

## 3. User roles / personas

| Role | Who | Core needs |
|---|---|---|
| **Customer** | Person ordering food | Discover restaurants, browse menus, order fast, pay reliably, track delivery live, reorder, rate experience |
| **Restaurant owner/staff** | Restaurant managing its storefront | Manage menu/availability/hours, receive & manage orders in real time, see payouts/analytics |
| **Rider (delivery partner)** | Person delivering orders | Accept/see assigned deliveries, navigate, update status, see earnings |
| **Platform admin** | Company operating the platform | Approve/manage restaurants & riders, resolve disputes, view platform-wide analytics, manage payments/refunds |

## 4. Core feature set ("everything a modern platform requires")

### Customer-facing
- Auth: email/password signup+login, email verification, password reset, session management
- Location-aware restaurant discovery (search, filter by cuisine/price/rating/delivery time, sort)
- Restaurant storefront: menu with categories, item detail, modifiers/options, availability
- Cart (one active restaurant per cart — standard food-delivery UX to keep delivery logistics sane)
- Checkout: delivery address selection/creation, delivery instructions, scheduled vs ASAP delivery
- Payments: Stripe, Paystack, Flutterwave — auto-selected by currency/region with manual override
  (see `docs/ARCHITECTURE.md` §Payment Routing)
- Order tracking: live status timeline (WebSocket-driven) + live map rider tracking once a
  Mapbox token is configured
- Order history, reorder, receipts
- Ratings & reviews (restaurant + rider)
- Notifications: email + in-app + SMS (order status, promos) — SMS via Termii (African SMS
  gateway, see `docs/ARCHITECTURE.md` §Notifications)
- Profile & saved addresses management
- Favorites/saved restaurants

### Restaurant-facing (dashboard)
- Menu management (categories, items, modifiers, photos via Cloudinary, availability toggles)
- Opening hours & temporary closures ("busy mode" / pause ordering)
- Incoming order queue with accept/reject/prepare/ready actions, real-time updates
- Order history & basic analytics (revenue, top items, order volume)
- Restaurant profile (logo, cover photo, description, cuisine tags, address/geo)
- Payout/settlement visibility (read-only ledger view; actual payout rails are provider-side)

### Rider-facing (dashboard)
- Online/offline availability toggle
- Assigned delivery queue, accept/decline
- Status updates (picked up → out for delivery → delivered)
- Live location broadcast (feeds customer's live tracking map)
- Earnings/delivery history

### Admin-facing
- Restaurant approval workflow (approve/suspend)
- Rider approval/verification workflow
- User management (customers/restaurants/riders), role management
- Order oversight, dispute/refund handling
- Platform-wide analytics (GMV, order volume, active restaurants/riders)
- Content moderation (reviews)

### Platform-wide / non-functional requirements
- Responsive, accessible (WCAG AA target) UI across mobile/tablet/desktop
- Light/dark theme switcher (light, dark, and system-follows-OS), token-driven so every
  component is dark-mode-correct automatically — see `docs/ARCHITECTURE.md` §7
- Real-time updates via WebSockets (order status, rider location, restaurant order queue)
- Image handling via Cloudinary (menu items, logos, avatars, rider documents) — never store
  binary blobs in MongoDB or on the app servers
- Multi-currency support (order currency = restaurant's configured currency)
- Strong input validation and error handling at every boundary (API DTOs, forms)
- Security: hashed passwords (bcrypt/argon2), JWT access+refresh tokens, httpOnly cookies,
  rate limiting, helmet, CORS locked to known origins, webhook signature verification for all
  3 payment providers, least-privilege role guards on every endpoint
  - Secret transport for the browser-side deployment note: same-site cookies plus CSRF
    mitigation are documented in `docs/ARCHITECTURE.md` §Auth
- Observability: structured logging, health check endpoints, error tracking hook (Sentry-ready)
- Testing: unit tests (business logic), e2e tests (critical API flows), component tests
  (UI kit), at least one Playwright flow for checkout
- CI: lint + typecheck + test must pass before merge (GitHub Actions)
- Deployment: frontend → Vercel, backend → Render, both driven by environment variables,
  zero secrets committed to git

## 5. Explicitly out of scope (for now)

Documented here so it's a deliberate choice, not an oversight — revisit via a new roadmap entry
in `docs/ROADMAP.md` if priorities change:

- Native mobile apps (the web app is responsive/mobile-first instead)
- In-house payout/ledger system beyond a read-only view (providers handle actual settlement)
- Multi-language / i18n (structured to allow it later, not implemented initially)

## 6. Glossary

- **FDP** — Food Delivery Platform (ticket/branch prefix, see `docs/ROADMAP.md`)
- **Order currency** — always the restaurant's configured currency; the platform does not do
  cross-currency conversion at checkout
- **Default provider** — the payment provider auto-selected for the customer based on the
  order's currency/region, per `docs/ARCHITECTURE.md` §Payment Routing; always overridable
