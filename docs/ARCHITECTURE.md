# Architecture

Technical source of truth. Product requirements live in `docs/PRODUCT_GUIDE.md`; the phased
build order lives in `docs/ROADMAP.md`. This doc describes *how* the system is built.

## 1. Repository layout

Plain two-app monorepo (no npm/pnpm workspace tooling), because the two apps deploy to
different hosts (Vercel vs Render) with independent build roots — a workspace adds complexity
neither host needs. Each app owns its own `package.json` and lockfile.

```
food_ordering_platform/
  backend/            NestJS + TypeScript API (deployed to Render)
  frontend/           Next.js + TypeScript app (deployed to Vercel)
  docs/               Product guide, architecture, roadmap, engineering rules
  .claude/skills/     Project-specific Claude Code skills (e.g. branch creation)
  CLAUDE.md           Root conventions read every session
```

`backend/CLAUDE.md` and `frontend/CLAUDE.md` are added when each app is scaffolded
(FDP-2 / FDP-3) with conventions specific to that app.

### Shared types

There is no shared npm package between the two apps (would require workspace tooling that
fights the two-host deploy model). Instead:
- Enums/constants that must match exactly (order status, roles, currency codes, payment
  provider names) are defined once in `docs/ARCHITECTURE.md` §Domain Model as the source of
  truth, then hand-mirrored in `backend/src/common/constants` and
  `frontend/src/lib/constants`.
- Any drift is a bug — when one side changes, update the other in the same PR.

## 2. Tech stack

**Backend:** NestJS, TypeScript, MongoDB via Mongoose, class-validator/class-transformer DTOs,
Passport JWT (access + refresh), Socket.IO gateway for realtime, Cloudinary SDK for media,
Stripe/Paystack/Flutterwave SDKs, `@nestjs/config` + Joi for env validation, `@nestjs/throttler`
for rate limiting, Helmet, Swagger (`@nestjs/swagger`) for API docs, Jest for unit/e2e tests.

**Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, **Redux Toolkit + RTK Query**
(single state layer — RTK Query for all server state/data fetching, plain slices for
client/UI state such as theme and cart), React Hook Form + Zod (forms/validation), Socket.IO
client, Mapbox GL JS (behind `NEXT_PUBLIC_MAPBOX_TOKEN`), Vitest + React Testing Library
(component tests), Playwright (critical-path e2e).

**Cross-cutting:** Cloudinary (all images), MongoDB Atlas (database), Stripe + Paystack +
Flutterwave (payments), GitHub Actions (CI), Vercel (frontend hosting), Render (backend
hosting).

## 3. Domain model

Core entities (Mongoose schemas in `backend/src/**/schemas`):

- **User** — email, phone, passwordHash, role (`customer|restaurant_owner|rider|admin`), name,
  avatarUrl (Cloudinary), addresses[], isEmailVerified
- **Address** — label, line1/2, city, state, country, postalCode, lat/lng, isDefault
- **Restaurant** — ownerId, name, slug, description, logoUrl, coverUrl, address+geo,
  cuisineTypes[], **currency** (ISO 4217 — source of truth for order currency), country,
  openingHours[], isOpen, isApproved, avgRating
- **MenuCategory** — restaurantId, name, sortOrder
- **MenuItem** — restaurantId, categoryId, name, description, price, imageUrl, isAvailable,
  modifierGroups[]
- **ModifierGroup** (embedded) — name, min, max, options[{ name, priceDelta }]
- **Cart** — userId, restaurantId (one active restaurant per cart), items[{ menuItemId, qty,
  selectedModifiers, notes }]
- **Order** — orderNumber, customerId, restaurantId, riderId?, items snapshot, subtotal,
  deliveryFee, serviceFee, tax, discount, total, **currency** (copied from restaurant at order
  time), status, statusHistory[{ status, at, by }], paymentProvider, paymentStatus, paymentRef,
  deliveryAddress+geo, estimatedDeliveryAt
- **OrderStatus** enum — `PENDING_PAYMENT, PLACED, ACCEPTED_BY_RESTAURANT, PREPARING,
  READY_FOR_PICKUP, ASSIGNED_TO_RIDER, PICKED_UP, OUT_FOR_DELIVERY, DELIVERED, CANCELLED,
  REFUNDED`
- **Payment** — orderId, provider (`stripe|paystack|flutterwave`), providerRef, amount,
  currency, status (`initiated|succeeded|failed|refunded`), rawWebhookPayload
- **Rider** — userId, vehicleType, isOnline, currentLocation{lat,lng}, isVerified, documents[]
  (Cloudinary), rating
- **Review** — targetType (`restaurant|rider`), targetId, orderId, authorId, rating, comment,
  images[]
- **Notification** — userId, type, title, body, isRead, channel (`email|inapp`), metadata
- **DeliveryZone** — restaurantId, polygon/radius, baseFee, perKmFee

## 4. Payment routing (Stripe / Paystack / Flutterwave)

Decision: **auto-select by the order's currency/region, with the customer able to manually
override to any provider that supports that currency.**

Order currency is always the restaurant's configured currency (no cross-currency conversion at
checkout). A `PaymentProviderResolver` (backend, `backend/src/payments/provider-resolver.ts`)
maps currency → an ordered list of supported providers; index 0 is the pre-selected default,
the rest populate the "switch provider" UI:

| Currency | Default | Alternates (if enabled) |
|---|---|---|
| NGN | Paystack | Flutterwave, Stripe |
| GHS, KES, ZAR, UGX, and other supported African currencies | Flutterwave | Paystack (where supported), Stripe |
| USD, EUR, GBP, CAD, AUD, and other global currencies | Stripe | Flutterwave |

This mapping is a config table, not hardcoded logic — new currencies/providers are added by
editing the table. Each provider implements a common `PaymentProvider` interface
(`initiate(order)`, `verify(reference)`, `handleWebhook(payload, signature)`,
`refund(paymentRef)`) so the checkout/webhook code never branches on provider name outside the
resolver and the three provider adapters.

Webhook signatures are verified for all three providers before any order/payment state is
mutated. Payment state transitions only happen server-side, driven by verified webhook events
or a verified `verify()` poll — never trusted from client-reported "payment succeeded" calls.

## 5. Design tokens (frontend source of truth)

Single source of truth: `frontend/src/styles/tokens.css` (Tailwind v4 is CSS-first — values
defined under `@theme` both generate utility classes, e.g. `bg-brand-600`, and are emitted as
real `:root` CSS custom properties, so there's no separate `tailwind.config.ts` to drift out of
sync). `frontend/src/styles/tokens.ts` layers typed `var()` accessors on top for the rare
non-Tailwind/JS consumer.

- **Color:** Burgundy primary scale (50–950, brand primary), neutral/white scale (surfaces,
  borders, text), semantic colors (`success`, `warning`, `danger`, `info`), each with
  foreground-safe pairings for contrast (WCAG AA)
- **Typography:** font family token (swappable in one place), a type scale (`xs`…`4xl`) with
  paired line-height, font-weight tokens
- **Spacing:** Tailwind v4's built-in spacing scale (single `--spacing` base unit) — used as-is
  rather than a hand-rolled scale, since it's already systematic
- **Radius, shadow, z-index, motion/duration:** each a token scale, not component-local magic
  numbers (z-index/duration live outside Tailwind's themable namespaces but are still real CSS
  custom properties — see `tokens.css`)
- **Breakpoints:** Tailwind v4's default scale (`sm`=640px, `md`=768px, `lg`=1024px, `xl`=1280px)
  is used unmodified — mobile-first, `sm:` is the one breakpoint most layouts actually branch on
  (see `frontend/CLAUDE.md` "Responsive design")

## 6. State management

Redux Toolkit is the single state management technology for the frontend — no parallel
context/store systems for app state:

- **`frontend/src/lib/redux/store.ts`** — `configureStore`, combining plain slices with the
  RTK Query `api` reducer/middleware.
- **`frontend/src/lib/redux/api.ts`** — one base `createApi` instance (`fetchBaseQuery` pointed
  at `NEXT_PUBLIC_API_URL`); each feature phase injects its own endpoints via
  `api.injectEndpoints()` rather than creating separate `createApi` instances, so there's one
  cache/tag graph for the whole app.
- **Plain slices** (`frontend/src/lib/redux/slices/`) hold client-only UI/app state that isn't
  server data — theme preference, cart (until checkout), auth session flags. Server data
  (restaurants, orders, etc.) always goes through RTK Query, never duplicated into a plain
  slice.
- Typed hooks (`useAppDispatch`, `useAppSelector`) in `frontend/src/lib/redux/hooks.ts` are the
  only way components touch the store — no untyped `useDispatch`/`useSelector`.

## 7. Theming (light/dark)

Token-driven, not component-driven: components never branch on a "dark mode" flag or sprinkle
`dark:` utility variants — they always read the semantic color tokens (`bg-surface`,
`text-text`, `bg-primary`, …), and those tokens' underlying CSS custom property values switch
based on the active theme. This means every component built against the semantic tokens (see
§5) is dark-mode-correct automatically, with no per-component dark-mode work.

- Light values are the default on bare `:root` in `frontend/src/styles/tokens.css`.
- Dark values override the same semantic variable names, applied twice: once under
  `@media (prefers-color-scheme: dark)` (guarded with `:root:not([data-theme="light"])`, so it
  only fires absent an explicit user choice), and again under `:root[data-theme="dark"]` (so an
  explicit choice always wins over the OS setting, in both directions).
- Theme mode (`light | dark | system`) is Redux state (`themeSlice`), the source of truth for
  the theme toggle UI. To avoid a flash of the wrong theme on load, a small inline script in
  the root layout (runs before hydration) reads the persisted preference and sets
  `document.documentElement.dataset.theme` synchronously; Redux re-syncs from that DOM state
  once it mounts, then owns all subsequent changes and keeps the DOM attribute + `localStorage`
  in sync with the store.

## 8. UI kit (hand-built, no external component library)

Built from scratch on top of the design tokens — every component in
`frontend/src/components/ui/`. Minimum inventory:

- **Primitives:** Button, IconButton, Link, Badge, Avatar, Chip/Tag
- **Forms:** Input, Textarea, Select (custom listbox), Combobox/Autocomplete, Checkbox,
  Radio/RadioGroup, Switch, Slider, ImageDropzone (Cloudinary upload), FormField
  (label+error+hint wrapper), DatePicker, TimeRangePicker
- **Feedback:** Toast, Alert/Banner, Modal/Dialog, Drawer/Sheet, Tooltip, Popover, Skeleton,
  Spinner, ProgressBar, EmptyState
- **Navigation:** Navbar, Sidebar, Tabs, Breadcrumbs, Pagination, Stepper (order tracking
  timeline)
- **Data display:** Card, DataTable, List, StatCard, Rating (stars), Accordion
- **Overlay/menu:** DropdownMenu, ContextMenu
- **Layout:** Container, Grid/Stack helpers, Divider

Because these are hand-built (no Radix/shadcn), each interactive component (Select, Dialog,
Combobox, DropdownMenu, RadioGroup) must implement correct ARIA roles, keyboard navigation, and
focus management itself — this is a hard accessibility bar and should be treated as a real
implementation task per component, not an afterthought. Component tests (Vitest + RTL) should
cover keyboard interaction, not just rendering.

Built in FDP-2 (Tier 1 — universal atoms + forms + feedback + basic navigation/layout):
Button, IconButton, Badge, Avatar, Link, Divider, Container, Label, Input, Textarea, Checkbox,
RadioGroup, Select, Switch, FormField, Spinner, Skeleton, Alert, Modal, Toast (+provider+hook),
Card, Tabs, Tooltip, DropdownMenu, Breadcrumbs, Pagination, EmptyState, ThemeToggle. Drawer
added in FDP-8 (mobile nav — see §"Never nest a DropdownMenu-based control inside Modal/Drawer"
in `frontend/CLAUDE.md` for why it's a separate component from `Modal` rather than a variant).

Deliberately deferred to the phase that first needs them, so they're built against real data
shapes instead of speculative ones: Accordion (restaurant details, FDP-5), ImageDropzone
(Cloudinary upload, FDP-5), DatePicker/TimeRangePicker (opening hours, FDP-5), Stepper (order
tracking, FDP-10), Rating (reviews, FDP-13), DataTable (admin, FDP-15), Combobox/ContextMenu/
Slider (built when a concrete screen needs one).

## 9. Realtime

Single Socket.IO gateway (`backend/src/realtime/`) with rooms per order (`order:<id>`) and per
restaurant (`restaurant:<id>`). Events: order status changes, rider location updates,
restaurant new-order notification. Frontend connects via a shared `useSocket` hook; the
customer order-tracking page and restaurant dashboard both subscribe to their relevant rooms.

## 10. Live map tracking

Behind `NEXT_PUBLIC_MAPBOX_TOKEN`. Built as a self-contained `<LiveDeliveryMap>` component that
degrades gracefully (falls back to the status-timeline Stepper only) if the token is absent, so
it never blocks other functionality on the key being configured.

## 11. Auth

JWT access token (short-lived, ~15 min, returned in the response body — the frontend keeps it
in Redux memory only, never `localStorage`, to limit XSS token theft) + refresh token
(long-lived, httpOnly, secure cookie, scoped to the `/auth/refresh` path), rotated on every
refresh (the old refresh token is invalidated the moment a new one is issued, so replaying a
stolen token stops working the moment the legitimate client refreshes). Role-based guards
(`@Roles()` decorator + `RolesGuard`) on every protected endpoint, checked against the access
token's payload.

**Cookie `SameSite` is environment-dependent, not a fixed choice** — this matters because
frontend (Vercel) and backend (Render) are on different registrable domains in production,
which makes them cross-site for cookie purposes even though local dev (`localhost:3000` →
`localhost:4000`) is same-site (site = scheme + eTLD+1; port doesn't count). So: `SameSite=Lax`
in development, `SameSite=None; Secure` in production — using `Lax`/`Strict` in production
would silently break the refresh flow entirely, since the browser would just never attach the
cookie to the cross-site request.

Email verification and password reset use short-lived, purpose-scoped JWTs (not general
access/refresh tokens) delivered by email via **Resend**. Login is allowed before email
verification (blocking it entirely adds friction for a requirement — verified-only actions —
that doesn't exist yet); `isEmailVerified` is exposed via `GET /auth/me` so the frontend can
show a banner, and future phases can gate specific actions (e.g. placing an order) on it.

CSRF: `SameSite=Lax`/`None` alone doesn't stop cross-site requests the way `Strict` would, but
`/auth/refresh` is the only cookie-authenticated endpoint (everything else uses the
Bearer-token access token, which a cross-site page can't read or attach), so the actual CSRF
exposure is narrow. Revisit with a double-submit token if that endpoint's risk profile changes.

**Silent reauth on access-token expiry (FDP-6):** the frontend's single RTK Query base query
(`frontend/src/lib/redux/api.ts`) wraps `fetchBaseQuery` so a 401 from any endpoint (other than
`/auth/login`/`/auth/register`/`/auth/refresh`, where a 401 means genuinely-not-authenticated,
not expiry) triggers one silent `/auth/refresh` call and a retry of the original request —
without this, the ~15 min access token expiring mid-session would surface as a bare error to
whatever the user happened to be doing. An `async-mutex` lock ensures concurrent 401s share one
refresh attempt rather than racing several against the single-use rotating refresh token above.
Session state is only cleared if the refresh itself fails (refresh token genuinely gone/reused).

## 12. Deployment topology

- **Frontend → Vercel:** root directory `frontend/`, framework preset Next.js, env vars set in
  Vercel project settings (never committed)
- **Backend → Render:** root directory `backend/`, Node web service, `render.yaml` blueprint
  checked in (structure only — actual secret values set in Render dashboard)
- **Database:** MongoDB Atlas (connection string via env var)
- **Media:** Cloudinary (API key/secret via env var)
- CORS on the backend is locked to the deployed frontend origin(s) + localhost for dev

## 13. Environment variables

Each app ships a `.env.example` documenting every required variable with a placeholder value
and a one-line comment on where to get it. Real values live only in local `.env` (gitignored)
and in the Vercel/Render dashboards.
