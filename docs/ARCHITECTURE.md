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
  avatarUrl (Cloudinary), addresses[], isEmailVerified, status (`active|suspended`,
  docs/ROADMAP.md FDP-89 — see §16)
- **Address** — label, line1/2, city, state, country, postalCode, lat/lng, isDefault
- **Restaurant** — ownerId, name, slug, description, logoUrl, coverUrl, address+geo,
  cuisineTypes[], **currency** (ISO 4217 — source of truth for order currency), country,
  openingHours[], isOpen, isApproved, avgRating, priceLevel (1-4, `$`..`$$$$`, FDP-21),
  estimatedDeliveryMinutes (static owner-set estimate, not a live ETA, FDP-21)
- **MenuCategory** — restaurantId, name, sortOrder
- **MenuItem** — restaurantId, categoryId, name, description, price, **costPrice?** (owner-only,
  never customer-facing — sales-report COGS/margin, `docs/ROADMAP.md` FDP-64), imageUrl,
  isAvailable, modifierGroups[]
- **ModifierGroup** (embedded) — name, min, max, options[{ name, priceDelta }]
- **Store** (`docs/ROADMAP.md` FDP-56) — ownerId, name, slug, type (`groceries|pharmacy_beauty`),
  tags[], description, logoUrl, coverUrl, complianceDocumentUrl?, **currency**, country,
  address+geo, openingHours[], isOpen, isApproved, avgRating, payoutAccounts[] (FDP-91) —
  Product/ProductCategory are its menu-equivalent, structurally parallel to Restaurant/
  MenuItem/MenuCategory but a separate collection (FDP-56's own domain, not "restaurant with a
  flag")
- **Cart** — userId, restaurantId (one active restaurant per cart), items[{ menuItemId, qty,
  selectedModifiers, notes }]
- **Order** — orderNumber, customerId, restaurantId, riderId?, items snapshot (incl. **costPrice?**
  per line, snapshotted from MenuItem at order time — FDP-64), subtotal, deliveryFee, serviceFee,
  tax, discount, total, **currency** (copied from restaurant at order time), status,
  statusHistory[{ status, at, by }], **deliveredAt?** (indexed; set once on the DELIVERED
  transition so date-range sales reporting doesn't need to unwind statusHistory, FDP-64),
  paymentProvider, paymentStatus, paymentRef, deliveryAddress+geo, estimatedDeliveryAt
- **OrderStatus** enum — `PENDING_PAYMENT, PLACED, ACCEPTED_BY_RESTAURANT, PREPARING,
  READY_FOR_PICKUP, ASSIGNED_TO_RIDER, PICKED_UP, OUT_FOR_DELIVERY, DELIVERED, CANCELLED,
  REFUNDED`
- **Payment** — orderId, provider (`stripe|paystack|flutterwave`), providerRef, amount,
  currency, status (`initiated|succeeded|failed|refunded`), rawWebhookPayload
- **Rider** — userId, vehicleType, isOnline, isVerified, rating, KYC fields (governmentId*,
  proofOfAddressDocumentUrl, driversLicense*, vehiclePlateNumber, guarantor, nextOfKin* — FDP-61),
  payoutAccounts[] (FDP-91). No stored location field — live location during an active delivery
  is relayed through `RealtimeGateway`, not persisted on the document (see §17's — no, see the
  realtime gateway's own doc comment)
- **Review** — targetType (`restaurant|rider`), targetId, orderId, authorId, rating, comment,
  images[]
- **Notification** (FDP-19) — userId, type, title, body, isRead, channels[] (`inapp` always +
  `email`/`sms` appended when that side channel was actually attempted — one row per
  notification event, not one row per channel), metadata
- **DeliveryZone** — polygon/radius, baseFee, perKmFee, plus exactly one of restaurantId?/
  storeId? (both nullable, docs/ROADMAP.md FDP-90 — a zone belongs to a restaurant or a store,
  never both; `DeliveryZonesService` is shared by both `DeliveryZonesController`
  (`restaurants/:restaurantId/delivery-zones`) and `StoreDeliveryZonesController`
  (`stores/:storeId/delivery-zones`), parameterized by a `sellerType` argument)
- **PromoCode** (FDP-11) — code (unique, uppercase), discountType (`percentage|fixed`),
  discountValue, minOrderAmount?, maxDiscountAmount? (caps a percentage discount), restaurantId?/
  storeId? (both `null` = platform-wide; at most one set, docs/ROADMAP.md FDP-90 extended this
  from restaurant-only to either seller type), expiresAt?, isActive, usageLimit?, usedCount — not
  in the original domain model, added when "promo/coupon code redemption" was found to be a gap
  against `PRODUCT_GUIDE.md`'s "modern platform" bar with no owning phase (see `docs/ROADMAP.md`
  FDP-9)

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

Restaurant payouts (a provider-side split at charge time, not a separate transfer) are §14.

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
  server data — theme preference, auth session flags. Server data (restaurants, orders, cart,
  etc.) always goes through RTK Query, never duplicated into a plain slice. **Cart is
  backend-persisted** (FDP-10) — it's a real Mongoose entity (§3) owned by a `cart-api.ts` RTK
  Query slice like any other server resource, not client-only Redux state; this earlier version
  of this doc said "cart (until checkout)" as if it were client-only, which contradicted §3's
  persisted `Cart` schema — persisting server-side is what lets a logged-in customer's cart
  survive a refresh/device switch, consistent with why a `Cart` schema exists at all.
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
(Cloudinary upload, FDP-5), Stepper (order tracking, FDP-13), Rating (reviews, FDP-18),
DataTable (admin, FDP-20), Combobox/ContextMenu/Slider (built when a concrete screen needs one).
**DatePicker/TimeRangePicker were never built** — FDP-5's opening-hours fields and FDP-11's
scheduled-delivery field both use a native `<input type="time">`/`<input type="datetime-local">`
via the existing `Input` component instead. That's the established precedent now, not a gap:
native date/time inputs are accessible, zero-maintenance, and good enough for every date/time
need so far — only build a custom picker if a real screen needs something a native input can't
do (e.g. a range picker, or a calendar with availability shading).

## 9. Realtime

Single Socket.IO gateway (`backend/src/realtime/`) with rooms per order (`order:<id>`), per
restaurant (`restaurant:<id>`), and per user (`user:<id>` — every authenticated connection
joins its own automatically, FDP-19). Events: order status changes, rider location updates,
restaurant new-order notification, `notification:new` (a fresh in-app notification, pushed live
to the bell UI). Frontend connects via a shared `useSocket` hook; the customer order-tracking
page and restaurant dashboard both subscribe to their relevant rooms.

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
frontend (Vercel) and backend (Render/Railway) are on different registrable domains in
production, which makes them cross-site for cookie purposes even though local dev
(`localhost:3000` → `localhost:4000`) is same-site (site = scheme + eTLD+1; port doesn't count).
So: `SameSite=Lax` in development, `SameSite=None; Secure` in production — using `Lax`/`Strict`
in production would silently break the refresh flow entirely, since the browser would just
never attach the cookie to the cross-site request.

**Browser-facing requests are proxied through the frontend's own origin (FDP-27)** —
`SameSite=None` alone isn't sufficient: browsers that block **third-party cookies** (Safari, in
every mode, by default; Chrome/Edge in private/incognito modes) never store or send the refresh
cookie at all, regardless of `SameSite`, because the backend is a different registrable domain
than whatever origin the browser is actually on. This shipped as a real bug — a signed-in user
who did a full reload or back-navigated to a page saw the header revert to "Log in"/"Sign up",
because the silent session-restore call (`SessionInitializer` → `/auth/refresh`) had no cookie
to send. Fixed by proxying all browser-facing RTK Query calls through the frontend's own origin:
`frontend/next.config.ts` rewrites `/api/:path*` to the backend, and
`frontend/src/lib/redux/api.ts`'s `fetchBaseQuery` uses the relative `baseUrl: "/api"` instead
of the absolute backend URL. Since the browser only ever talks to the frontend's own origin for
these calls, the `Set-Cookie` response (relayed through the proxy) is attributed to that origin
too — first-party, not third-party — so it's stored and sent regardless of the browser's
third-party cookie policy. The backend's refresh cookie `path` is `/api/auth`, not `/auth`, to
match this browser-visible path (`backend/src/auth/auth.controller.ts`).
This only applies to REST calls; server-side fetches (e.g. `restaurants/[slug]/layout.tsx`,
`sitemap.ts`) and the Socket.IO connection (`frontend/src/lib/socket.ts`, authenticated via the
access token at handshake, not the cookie) still talk to the backend's absolute URL directly —
proxying doesn't apply to either (server-side fetches aren't browser requests Next.js can route,
and Socket.IO's own transport isn't backed by this HTTP rewrite).

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

**`SessionInitializer`'s on-mount refresh shares the same mutex (FDP-38).** `SessionInitializer`
(`frontend/src/components/session-initializer.tsx`) proactively calls `/auth/refresh` once on
mount, independent of any 401 — needed because a page with no authenticated queries at all (e.g.
the homepage, whose only query is `@Public()`) would otherwise never trigger the 401-based reauth
above, leaving `status` stuck at `"idle"` forever. This proactive call must acquire `api.ts`'s
exported `mutex` for its duration. Before this fix it didn't, so a page that mounts an
authenticated query *at the same time* (the first one in the app to do so: `checkout/callback`'s
`useGetOrderQuery`, reached right after a Paystack redirect) raced its own 401-triggered refresh
against `SessionInitializer`'s — two concurrent calls reading the same single-use rotating
refresh token, one of which trips reuse-detection and revokes the whole session. Real symptom: a
customer completing a real payment landed back on the site logged out with a bare "Unauthorized".
Any future code that calls `/auth/refresh` directly (rather than going through a 401 on the
shared `api` instance) must acquire this same mutex, or it reintroduces the race.

**That fix itself shipped a self-deadlock, fixed same-day (FDP-39).** `refresh()` is an RTK
Query mutation on the same `api` instance, so it too goes through `baseQueryWithReauth` — which
opens with `await mutex.waitForUnlock()`. Once `SessionInitializer` held the mutex around its own
`refresh()` call, that call's own request hit this same line and waited on a lock only
`SessionInitializer` itself could release *after* the call finished: a hard deadlock, hanging
every request on every page behind it. Caught by actually running the fix locally against the
real backend before trusting it — not by reasoning about the mutex in the abstract. Fixed by
skipping `await mutex.waitForUnlock()` specifically when the outgoing request's URL is
`/auth/refresh` itself; a plain `mutex.acquire()`/`release()` around a call has to exempt that
call's own request this way whenever the call routes back through the same `baseQuery`.

**Phone number sign-up/login via SMS OTP (FDP-41).** Email/password stays the account's primary
identity — this deliberately does *not* make email optional or phone-only signup possible, since
email is assumed to exist everywhere else in the system (receipts, password reset, admin lists).
Phone is a verified, optional supplement:

- `POST /auth/phone/send-code` (`{ phone, purpose: 'signup' | 'login' }`) generates a 6-digit
  code, stores it hashed (sha256, same as refresh tokens — a slow bcrypt hash buys nothing extra
  once the code is already rate-limited, expires in 5 min, and locks out after 5 wrong
  attempts), and sends it via the existing Termii `SmsService` (FDP-19). `purpose: 'login'`
  never reveals whether a matching verified account exists — no account, no text, but the same
  generic response either way (same reasoning as `forgotPassword`).
- `POST /auth/phone/verify-code` checks the code. For `purpose: 'signup'`, there's no user yet,
  so it returns a short-lived (`10m`) `phoneVerificationToken` (JWT, `JWT_EMAIL_SECRET`) instead
  — `POST /auth/register` requires this token alongside a matching `phone` to actually attach it
  to the new account; a bare `phone` with no valid token is rejected outright, never silently
  trusted. For `purpose: 'login'`, proving phone ownership via OTP *is* the credential —
  passwordless, logs the caller straight in with real session tokens, same as email/password
  login.
- `SmsService` moved out of `NotificationsModule` into its own `SmsModule`
  (`backend/src/notifications/sms.module.ts`) so `AuthModule` can use it without pulling in
  `NotificationsModule` → `RealtimeModule` → `AuthModule`, which would otherwise be a circular
  module dependency.

**"Continue with Google" (FDP-42).** A server-driven OAuth redirect (Passport's
`passport-google-oauth20` strategy), not Google's client-side JS SDK — no new frontend script,
and it composes with the existing cookie-proxy architecture above instead of fighting it:

- The frontend's "Continue with Google" is a plain `<a href="/api/auth/google">` (a real browser
  navigation, not `NextLink`/fetch) — Next.js's existing `/api/:path*` rewrite forwards this to
  the backend exactly like any other proxied call, so it needs no new rewrite rule.
- `GET /auth/google` (`AuthGuard('google')`) redirects to Google's consent screen. Google's own
  redirect back to `GET /auth/google/callback` necessarily lands directly on the backend's own
  domain — Google needs a fixed, pre-registered absolute callback URL, so this one leg can't go
  through the frontend's proxy the way our own calls do.
- That means a cookie set directly in the callback response would be third-party again (the
  exact problem the `/api/*` proxy above exists to avoid). Instead, the callback finds-or-creates
  the user by (Google-verified) email — an existing email/password account just gets Google as
  an additional way in, not a separate account — and mints a 60-second `OAuthExchangeTokenPayload`
  JWT, redirecting to `${FRONTEND_URL}/login/oauth-callback?code=...`. No session token is ever
  put in a URL, only this narrow, single-purpose, short-lived exchange code.
  That frontend page immediately redeems it via `POST /auth/oauth/exchange` — a normal call
  through the frontend's own `/api/*` proxy — which is where session tokens actually get issued
  and the refresh cookie is finally set, correctly first-party.
- A brand-new Google signup gets an unusable random password (bcrypt-hashed, nobody knows the
  plaintext) until they set a real one via "forgot password", `isEmailVerified: true` (Google
  already verified it), and `role: 'customer'` — Google sign-in has no UI step to pick
  `restaurant_owner` the way the registration form does.
- `GoogleStrategy` falls back to harmless placeholder client ID/secret when unconfigured (same
  graceful-degradation pattern as Termii/Mapbox) — `passport-oauth2`'s constructor throws
  synchronously on a missing `clientID`, which would otherwise crash app boot entirely in any
  environment without Google configured, not just make the feature unavailable.
- `GOOGLE_CALLBACK_URL` must exactly match an "Authorized redirect URI" registered on the Google
  Cloud OAuth client — this has to be updated (adding the real backend's own https URL) whenever
  the backend's deployed domain changes, the same way `FRONTEND_URL`/`CORS_ORIGINS` already do.

**"Continue with Facebook" (FDP-42) reuses every part of the above.** Same server-driven
Passport redirect pattern (`passport-facebook`), the same `OAuthProfile` shape
(`AuthService.loginOrRegisterWithOAuthProfile` doesn't know or care which provider
authenticated the person), the same exchange-token handoff through `/login/oauth-callback`,
and the same placeholder-credentials graceful degradation. `FACEBOOK_CALLBACK_URL` must
likewise exactly match a "Valid OAuth Redirect URI" registered on the Facebook app's Login
product settings.

## 12. Deployment topology

- **Frontend → Vercel:** root directory `frontend/`, framework preset Next.js, env vars set in
  Vercel project settings (never committed)
- **Backend → Railway** (currently live host; Render is a documented fallback — see
  `docs/DEPLOYMENT.md` for why and how to switch back): root directory `backend/`, Node web
  service, `render.yaml` blueprint still checked in and functional for the Render path (structure
  only — actual secret values set in whichever dashboard is hosting it)
- **Database:** MongoDB Atlas (connection string via env var) — see §15 for migrations/backups
- **Media:** Cloudinary (API key/secret via env var)
- CORS on the backend is locked to the deployed frontend origin(s) + localhost for dev

## 13. Environment variables

Each app ships a `.env.example` documenting every required variable with a placeholder value
and a one-line comment on where to get it. Real values live only in local `.env` (gitignored)
and in the Vercel/Render dashboards.

## 14. Payouts & platform fee

Decision (docs/ROADMAP.md FDP-51 onward, reversing an earlier "read-only ledger" scope): the
platform takes a commission on every order, and the restaurant's remaining share settles
automatically via the payment provider's own split/connected-account mechanism. The platform
never holds customer funds and manually disburses them — no in-house wallet or transfer queue.

**Commission model.** `PLATFORM_COMMISSION_RATE` (`backend/src/common/constants/platform-fee.ts`,
currently 15%) is a single shared constant applied to the order's food `subtotal` only — never
`deliveryFee` (the rider's own earnings, see `OrdersService.findForRider`) or `serviceFee`
(already the platform's direct revenue line). `OrdersService.createOrder` snapshots the result
onto every order as `platformFeeAmount`/`restaurantPayoutAmount` at creation time, so a later
rate change never rewrites historical orders. `OrdersService.getEarningsSummary` sums these over
a restaurant's `DELIVERED` orders for its dashboard.

**Per-provider onboarding.** `Restaurant.payoutAccounts` holds one entry per payment provider a
restaurant has connected — `{ provider, status: 'pending' | 'active', reference }`, mirroring the
multi-provider reality `PaymentProviderResolver` already models (a customer can override the
currency's default provider per order, so a restaurant's payout coverage has to cover more than
just its default). Until a provider has an `active` entry, that provider's orders for this
restaurant settle in full to the platform's own account — never blocked, just not yet split.

**Paystack (FDP-52, live).** A restaurant supplies a bank + account number
(`PaystackPayoutsController`); the backend resolves it via Paystack's `/bank/resolve` (confirms
the account name before anything is created — the cheapest fraud/typo guard available) and
creates a subaccount via `/subaccount`, storing the resulting `subaccount_code` as the payout
account's `reference`. At charge time, `PaymentsService.initiatePayment` looks up the order's
restaurant's *active* Paystack account and passes it to `PaystackAdapter.initiate()`, which adds
`subaccount` (routes the split) and an explicit `transaction_charge` — **not** the subaccount's
own stored `percentage_charge`, and this distinction matters: a flat percentage of the whole
order `total` would hand the restaurant a cut of the delivery fee and service fee too, since
neither belongs to it. `transaction_charge` is computed per-transaction as
`total - restaurantPayoutAmount` (in the provider's minor unit), so Paystack pays the restaurant
subaccount *exactly* `restaurantPayoutAmount` and settles everything else — the platform's
commission, the delivery fee, and the service fee — to the platform's own account. The delivery
fee's eventual trip to the rider is a separate, not-yet-automated concern (riders currently just
see it reflected in their own earnings view, docs/ROADMAP.md FDP-16); this split only concerns
restaurant payouts.

**Flutterwave (FDP-53)** follows the same subaccount-and-split shape as Paystack, with two
provider-specific differences confirmed live against the Flutterwave sandbox (nothing in this
codebase referenced Flutterwave's actual field names before this ticket): the split lives in a
`subaccounts` array on the payment payload rather than a single `subaccount` field, and its
`flat_subaccount` charge type is the *inverse* of Paystack's `transaction_charge` direction —
`transaction_charge` is the flat amount the **subaccount** (restaurant) receives, with the
platform automatically keeping whatever's left, rather than Paystack's "what the platform keeps"
framing. `transaction_charge` is therefore set directly to `restaurantPayoutAmount`, in the
currency's major unit (Flutterwave, unlike Paystack, never multiplies by 100). Flutterwave's
subaccount-creation `split_value` is also a fraction (0–1), not Paystack's 0–100 percentage.
Flutterwave's subaccount API requires a `business_email`; since there's no restaurant-level email
field, the onboarding endpoint looks up the restaurant owner's own account email for it.

**Stripe Connect (FDP-54)** — Express accounts, structurally different from the other two: no
single API call produces a usable account. `StripePayoutsController`'s one endpoint creates a
connected Express account (once — reused on every later call, keyed off the restaurant's
existing `payoutAccounts` entry) and always returns a fresh Account Link (these expire within
minutes, confirmed live against the sandbox) to redirect the owner to Stripe's own hosted
onboarding; bank details never touch this backend. The account starts `pending` and stays that
way — even after the owner's browser lands back on `return_url` — until Stripe's `account.updated`
webhook confirms `charges_enabled && details_submitted`, the only reliable completion signal
(the redirect back does not guarantee the account holder actually finished). That webhook shares
`/payments/webhooks/stripe` with the existing `checkout.session.completed` handler — a Stripe
account has one webhook URL for every subscribed event type — and each handler's adapter-level
parse safely no-ops on the other's event type. At charge time, a destination charge
(`payment_intent_data.transfer_data.destination` + `application_fee_amount`) is added only once
`payoutAccounts` shows `active` for Stripe; `application_fee_amount` is what the platform keeps
(same "what the platform keeps" framing as Paystack's `transaction_charge`), computed from
`restaurantPayoutAmount` in cents — Stripe automatically transfers the rest to the connected
account, confirmed live that a destination account missing the `transfers` capability (i.e.
`pending`) is rejected outright by Stripe, which is exactly the gate this codebase relies on
rather than re-checking capability status itself before charging.

*(This section describes the instant charge-time split model, still what's actually live today —
it settles every order's split automatically at charge time, so it keeps working unmodified
throughout the staged rollout described below. docs/ROADMAP.md FDP-91 onward is building a
platform-controlled weekly batch payout as a deliberate staged rollout, not a single big-bang
cutover — FDP-91 laid down the ledger schema foundation (§18); FDP-92 (§19) built real transfer
execution and the Monday scheduler on top of it, but still only *reads* `Order` data this section
already writes, and this section's own split calls are untouched. The actual cutover (removing
this section's provider-split calls from `PaymentsService.initiatePayment`, so the platform's own
account collects the full order amount and every payout goes out through the weekly batch
instead) happens in a later ticket in this same sequence, alongside dashboards — and that's when
this section gets rewritten. Until then it's still accurate, and running in parallel with §19
safely: `PaymentsService.initiatePayment` stamps `Order.settledViaInstantSplit` on every order
(true only when this section's split was actually applied to that order's charge), and
`PayoutsService.getUnpaidVendorEarnings` excludes any order with that flag set — so a vendor whose
account is active here never gets paid a second time by the weekly batch for the same order. The
weekly batch only ever pays out orders this section's split did NOT reach: a store order (stores
have no payout-account concept yet), or a restaurant/store with no active account for the specific
provider that particular order happened to charge through. This is *why* FDP-92's transfer
execution is safe to actually run in production before the cutover ticket lands, instead of the
cutover and the batch job needing to ship together.)*

## 15. Database migrations, backups & disaster recovery

(docs/ROADMAP.md FDP-88) The platform ran with zero migration tooling and no documented backup
strategy for its first 87 tickets — every schema change was pure Mongoose-schema-drift (adding an
optional field needs nothing extra; Mongoose just returns `undefined`/the field's `default` for
documents that predate it) with no version tracking, and nothing stated what MongoDB Atlas
backup tier/retention was actually in use. Both gaps are closed here.

**Migrations — `migrate-mongo`.** `backend/migrate-mongo-config.js` points it at `MONGODB_URI`;
migration files live in `backend/migrations/`, tracked in a `changelog` collection in the
database itself (not in git) so `migrate-mongo status` always reflects what's actually been
applied to that specific environment's data, independent of which commit is deployed. Commands:
`npm run migrate:create -- <name>`, `migrate:up`, `migrate:down`, `migrate:status`. A baseline
no-op migration (`migrations/20260905000000-baseline.js`) marks "migration tracking starts here"
so `migrate-mongo up` has a defined starting point against the already-populated production
database rather than nothing to compare against. See docs/ENGINEERING_RULES.md for exactly when
a schema change needs a real migration from now on (short version: anything that transforms or
depends on existing documents' shape — a rename, a required-field backfill, a type change — not
just adding a new optional field, which still needs nothing).

**Backups.** MongoDB Atlas's own Cloud Backup (continuous, point-in-time restore) only exists on
paid dedicated clusters (M10 and up) — a free M0 shared cluster has **no automated backup
whatsoever**. Whichever tier is actually in use should be confirmed in the Atlas dashboard under
Clusters → Backup, and if that's ever unclear again, err on the side of assuming M0 (no
protection) rather than assuming the paid tier's safety net is there. Two scripts exist as a
tier-independent safety net either way, since they don't depend on anything Atlas-side:
- `npm run backup` (`backend/scripts/backup-database.ts`) — dumps every collection to timestamped
  EJSON files under `backend/backups/<timestamp>/` (gitignored; EJSON round-trips `ObjectId`/
  `Date`/etc. exactly, unlike plain `JSON.stringify`). Produces a local dump only — it does not
  upload anywhere, since no cloud storage bucket/credentials are configured for this project.
  Run it on a schedule (cron / Windows Task Scheduler) from any machine with network access to
  `MONGODB_URI`, then copy the output folder to storage you control.
- `npm run restore -- <path> --yes` (`backend/scripts/restore-database.ts`) — fully replaces
  (`deleteMany` + re-insert, never a merge) each collection in the dump. Requires the explicit
  `--yes` flag; omitting it prints exactly what would be restored and changes nothing. (This
  script deliberately does not use an interactive "type yes to confirm" prompt — a real, narrow
  bug was found where Node's `readline` hangs indefinitely once a `mongoose` import is also
  present, under this project's `ts-node` setup on Windows. An explicit flag sidesteps it and is
  arguably the better design for an unattended/scriptable disaster-recovery tool anyway.)

**Recovery runbook**, in order of preference:
1. If Atlas Cloud Backup is active for the cluster's tier, use Atlas's own point-in-time restore
   first — it's more complete (captures everything up to the moment of failure, not just the
   last scheduled `npm run backup` run) and doesn't require finding/trusting a local dump file.
2. Otherwise (M0, or Atlas restore unavailable for any reason), find the most recent
   `backend/backups/<timestamp>/` folder (wherever it was copied to after the last `npm run
   backup` run) and restore it: `npm run restore -- <path> --yes` against the target
   `MONGODB_URI`.
3. Either way, run `npm run migrate:status` immediately after restoring — a dump taken before a
   since-applied migration needs that migration re-applied (`npm run migrate:up`) to bring the
   restored data's shape back in line with the currently-deployed code.

## 16. Admin user management (docs/ROADMAP.md FDP-89)

Closes an audit-identified gap: there was no way to ban/suspend a user, no general user list, and
the only way to grant `admin`/`rider` was a raw `PATCH /users/:id/role` call with no UI in front
of it.

**Suspension, not deletion.** `User.status` (`'active' | 'suspended'`, default `'active'`) plus
`suspendedAt`/`suspendedReason` for the audit trail — a suspended account's data stays intact
(orders, reviews, saved addresses), unlike a delete, which would also break every existing
document that references that user's id. An admin can't suspend their own account
(`UsersService.suspend` throws if `id === requesterId`) — a real lock-yourself-out risk, not a
hypothetical.

**Enforcement is a deliberate two-tier design, not full coverage everywhere:**
- `AuthService.login`/the phone-login branch/`exchangeOAuthToken` all check `status` before
  issuing tokens (shared `assertActive()` helper) — a suspended account can't start a new
  session.
- `UsersService.suspend()` immediately revokes every one of that user's `RefreshToken` documents
  (same `updateMany({ revokedAt: null }, { revokedAt: new Date() })` pattern
  `AuthService.resetPassword`/reuse-detection already use), so silent token refresh stops working
  right away — `AuthService.refresh()` also checks `status` directly as a backstop, but in the
  normal flow it never even reaches that check, since the presented token is already revoked.
- **What's deliberately NOT done**: `JwtAccessStrategy.validate()` does not query the database on
  every request — it trusts the signed access-token payload, as it always has. This means a
  suspended user's still-valid access token (≤15 min, `JWT_ACCESS_EXPIRES_IN`) keeps authenticating
  existing requests until it naturally expires. Adding a DB lookup there would close this window
  completely but adds a query to every single authenticated request in the app; the ~15-minute
  worst case was judged an acceptable tradeoff rather than a real security gap, since it only
  matters for someone already mid-session at the exact moment they're suspended.

**A real Mongoose 9 pitfall hit building this** — see backend/CLAUDE.md's "Stack specifics" note:
`RefreshToken.userId` stores as a plain string in this project's setup, not a real `ObjectId`, so
the revocation `updateMany` must query with `user._id.toString()`, never a bare `ObjectId`
(silently matches zero documents otherwise, no error). Caught by a live integration test
asserting the token was actually revoked, not by anything throwing.

**Frontend**: new Admin → Users tab (`frontend/src/app/[locale]/admin/users-tab.tsx`) —
paginated list, search, role/status filters, a role-change `Select` per row (the first UI ever
built for the pre-existing role-grant endpoint), and Suspend (reason required, plain-text modal)/
Reactivate actions.

## 17. Store order parity (docs/ROADMAP.md FDP-90)

Store (grocery/pharmacy) orders originally shipped (FDP-56) as a deliberately reduced version of
a restaurant order — a flat 10% delivery fee regardless of distance, and promo codes rejected
outright, since `PromoCode`/`DeliveryZone` were both restaurant-only schemas at the time. This
closes both gaps; a store order now goes through exactly the same pricing logic a restaurant
order does.

**`DeliveryZonesService` is now seller-type-generic**, not restaurant-specific: every method
(`list`/`create`/`update`/`delete`/`calculateFee`) takes a `DeliveryZoneSellerType`
(`'restaurant' | 'store'`) as its first argument and dispatches internally — `calculateFee`
itself only needs a minimal structural shape (`{ _id, address }`), which both
`RestaurantDocument` and `StoreDocument` satisfy, rather than a restaurant-typed parameter. Two
thin controllers share the one service: the existing `DeliveryZonesController`
(`restaurants/:restaurantId/delivery-zones`) and a new `StoreDeliveryZonesController`
(`stores/:storeId/delivery-zones`) — deliberately two controllers, not one generic
`:sellerType/:sellerId/delivery-zones` route, since NestJS route params work more naturally this
way and the two dashboard pages calling them already have distinct id params in scope. The
`DeliveryZone` schema's `restaurantId` went from `required: true` to `default: null` alongside a
new `storeId` (also `default: null`) — no migration needed (docs/ENGINEERING_RULES.md): every
existing document already has a valid `restaurantId`, and Mongoose applies the schema default for
the now-missing `storeId` on read, without rewriting anything on disk.

**`PromoCodesService.validate()` takes a `PromoCodeSeller` discriminated union**
(`{ sellerType: 'restaurant', sellerId } | { sellerType: 'store', sellerId }`) instead of a bare
`restaurantId: string` — a promo scoped to the other seller type, or to a specific
restaurant/store the cart doesn't belong to, is rejected the same way either direction. `PromoCode`
gained a `storeId` field alongside `restaurantId` (both nullable, at most one ever set — enforced
in `PromoCodesService.create`/`update`, not the schema, since Mongoose validators don't easily see
sibling fields). `OrdersService.createStoreOrder` now calls `deliveryZonesService.calculateFee`
and `promoCodesService.validate`/`redeem` exactly the way `createRestaurantOrder` always has,
instead of a hardcoded flat-rate calculation and an unconditional rejection.

**A real bug found while adding test coverage for this**: `PromoCodesService.create()` wasn't
declared `async` — a plain function returning `this.promoCodeModel.create(dto)`. The new
mutual-exclusivity check (`assertAtMostOneSeller`) throws *before* that return statement runs,
so the throw happened synchronously, outside any promise — every caller (including
`.rejects.toThrow()` in tests) expecting a rejected promise from a service method silently broke.
Fixed by making `create()` `async`, which makes any throw inside it automatically become a
rejected promise, matching `update()`'s existing (already-`async`) behavior.

**Frontend**: new `dashboard/stores/[id]/delivery-zones/` page + form modal, mirroring the
restaurant version almost exactly (different store-specific wording for the "no coordinates"
warning, since reusing the restaurant-worded translation strings verbatim would have been wrong
copy on the store page). `checkout/page.tsx`'s `promoCodesSupported` gate (which hid the entire
promo-code UI section for a store cart) is removed — `applyPromo()` now sends `storeId` or
`restaurantId` depending on `cart.sellerType`.

## 18. Payout ledger foundation (docs/ROADMAP.md FDP-91)

First step of replacing §14's instant charge-time provider split with a platform-controlled
weekly batch payout (a deliberate, staged rollout — see §14's note). This ticket is purely
additive: a new schema and a read-only aggregation service, with **zero changes** to the
existing instant-split payment flow, so nothing about how vendors currently get paid changes
until the follow-up tickets that actually execute a transfer and schedule the weekly run land.

**`PayoutAccount` moved to `common/`** (from `restaurants/schemas/`) once `Store` and `Rider`
both needed their own `payoutAccounts` array, the same "move once a second domain needs it"
pattern `Address`/`OpeningHour` already went through.

**New `Payout` schema** (`backend/src/payouts/schemas/payout.schema.ts`) — one document per
payout *attempt* for one vendor or rider: `vendorType` (`'restaurant' | 'store' | 'rider'`),
`vendorId` (plain string, no `ref` — deliberately polymorphic), `orderIds` (the exact
`DELIVERED` orders this attempt covers), `grossAmount`, `currency`, `provider`,
`payoutAccountReference` (snapshotted, not looked up live), `status`
(`'pending' | 'processing' | 'succeeded' | 'failed'`), `providerTransferReference`,
`failureReason`, `retryCount`. Registered in a new `PayoutsModule`, not yet written to by
anything — the follow-up ticket that actually creates these needs no further module wiring.

**`Order` gained two independent payout-tracking fields**: `vendorPayoutId` and `riderPayoutId`
(both nullable strings), not one — a single delivered order's earnings split two ways that
settle on separate schedules to separate people: the vendor's cut (`restaurantPayoutAmount`,
already net of the platform's commission) and the rider's cut (`deliveryFee`, riders keep 100%
of this — the platform's commission only ever comes from the vendor side, never the rider side).
Marking one paid must never imply the other is.

**`PayoutsService.getUnpaidVendorEarnings`/`getUnpaidRiderEarnings`** — the one place that
answers "what does this vendor/rider currently have coming to them," grouped by currency (a
vendor could in principle have delivered orders in more than one). Built as its own
independently-testable service now specifically so the weekly-batch job (the next ticket in this
sequence) can call it directly rather than duplicating this aggregation inline in a cron
handler.

## 19. Weekly payout execution (docs/ROADMAP.md FDP-92)

Real money movement on top of §18's ledger — a Monday-at-midnight-UTC cron
(`PayoutSchedulerService`) drives `PayoutExecutionService.runWeeklyBatch()`, which finds every
restaurant/store/rider with at least one `active` payout account, computes their unpaid earnings
via `PayoutsService`, and actually calls each provider's Transfer API.

**The double-pay guard is the load-bearing piece of this ticket.** §14's instant charge-time split
is still live and unmodified — a restaurant with an active payout account for a given provider
already gets paid automatically, at charge time, by that mechanism. Before this ticket, nothing
distinguished "this order's vendor cut is still owed" from "this order's vendor cut was already
sent by the instant split" — `PayoutsService`'s ledger just tracked `vendorPayoutId: null` either
way. Turning on real transfers against that data as-is would have double-paid every vendor with
an active account for every one of their delivered orders. Fixed with one new field,
`Order.settledViaInstantSplit` (stamped by `PaymentsService.initiatePayment`/
`OrdersService.setPaymentRef` on every order, mirroring `paymentProvider`'s "reflects the latest
payment attempt" semantics), which `PayoutsService.getUnpaidVendorEarnings` now excludes. A
one-time migration (`migrations/20260909000000-backfill-settled-via-instant-split.js`) backfills
this flag onto pre-existing delivered orders using the best available proxy (does this order's
seller currently have an active account for the exact provider that order charged through) —
deliberately biased toward over-marking `true` (a vendor manually reconciled once, the safe
failure mode) rather than under-marking it (a vendor paid twice, the dangerous one). Riders have
no equivalent guard because they have no pre-existing instant-split mechanism to collide with —
the weekly batch is the *first* payout mechanism they've ever had.

**Grouping had to become (provider, currency), not just currency** (§18's `PayoutsService` was
revised in this same ticket) — the platform's own settled balance for a given order sits with
whichever specific provider processed that charge (a customer can override the currency's default
provider per order), so a transfer has to go out through that same provider. Merging two orders
charged via different providers into one payout group would have made a correct transfer
impossible to construct.

**Money-movement safety, per attempt (`PayoutExecutionService.executePayout`):**
1. A `Payout` document is created (`pending`) and its `orderIds` are atomically claimed on
   `Order` (`vendorPayoutId`/`riderPayoutId`: `null` → this payout's id) *before* any provider is
   called. Claiming fewer orders than expected (a race — not expected with a single scheduler
   instance, but checked anyway) aborts safely: nothing was claimed for long, no transfer is
   attempted, and every admin is notified.
2. `payout.status = 'processing'`, persisted, then the provider's real Transfer API is called
   (`StripeAdapter.transfer` — a standalone `stripe.transfers.create` to the connected account,
   not a destination charge; `PaystackAdapter.transfer` — creates a `type: 'subaccount'` transfer
   recipient from the stored subaccount reference, then transfers to it (requires the platform's
   live Paystack account to have transfer OTP disabled — an operational prerequisite this code
   cannot itself satisfy); `FlutterwaveAdapter.transfer` — a standalone bank transfer using
   `PayoutAccount.bankCode`/`accountNumber` (added this ticket — Flutterwave's Transfers API has
   no "pay this subaccount" call the way Paystack's does), populated at onboarding time going
   forward; an account onboarded before this ticket needs re-onboarding before it can receive a
   real Flutterwave payout).
3. **A confirmed, clean provider rejection** (bad/disabled destination, insufficient balance,
   etc. — the provider clearly says nothing was transferred) marks the payout `failed` and
   releases the claimed orders back to `null`, so the next Monday run retries them automatically.
4. **An ambiguous failure** — a network-layer error where the request may or may not have
   reached the provider, thrown by every adapter's `transfer()` as
   `TransferOutcomeUnknownError` rather than a plain `Error` — does the opposite on purpose: the
   claimed orders stay claimed (never auto-released, never auto-retried, since either could
   double-pay), the payout is flagged `reconciliationRequired: true`, and every admin gets an
   urgent notification to check the provider's own dashboard and resolve it by hand. This is the
   platform's "no loopholes" payout requirement made concrete: an uncertain outcome always
   surfaces to a human immediately, in neither direction, rather than resolving itself silently.
5. One vendor/rider's failure (of any kind) is caught at the per-vendor level and never aborts
   the rest of the batch.

A vendor/rider whose unpaid earnings are in a (provider, currency) they have no *active* account
for yet is skipped for that group (counted, logged) rather than forced through the wrong account
— expected today for stores and riders, since only restaurant onboarding exists as of this
ticket; store/rider onboarding is FDP-93.

**Admin manual trigger**: `POST /payouts/run-weekly-batch` (admin-only, tightly throttled) runs
the identical batch the cron runs — for verifying the pipeline without waiting a week, and for
re-running after a vendor's account issue is fixed rather than waiting for next Monday. Full
payout listing/dashboards are FDP-93.

## 20. Payout dashboards & manual reconciliation (docs/ROADMAP.md FDP-93)

Read/write surface on top of §19's ledger — no changes to how a payout is executed, only to how
it's seen and, for the one `reconciliationRequired` case, manually closed out.

**Endpoints** (all on `PayoutsController`, alongside the existing manual-trigger route):
`GET /payouts` (admin — every payout, filterable by `status`/`vendorType`/
`reconciliationRequired`), `GET /payouts/restaurants/:restaurantId` and
`GET /payouts/stores/:storeId` (owner or admin — that vendor's own history, same
`assertOwnerOrAdmin` pattern every other vendor-scoped endpoint already uses), and
`GET /payouts/riders/me` (a rider's own history — resolves the caller's own `Rider` profile via
`RidersService.findMine` first, since `Payout.vendorId` for a rider is the **Rider document id**,
not the User id, and there's no way to derive one from the other without the lookup).

**`PayoutExecutionService.resolveReconciliation`** is the human-in-the-loop close-out for a
`reconciliationRequired` payout (`PATCH /payouts/:id/resolve-reconciliation`, admin-only) — after
an admin has actually checked the provider's own dashboard for a transfer matching the attempt's
amount/timing. Two new `Payout` fields, `reconciledAt`/`reconciledBy`, record who closed it out
and when, purely for audit purposes (the behavior change is `reconciliationRequired` flipping to
`false`, not these). Two outcomes, matching exactly what a clean rejection vs. an ambiguous
failure would have each done automatically had the outcome been known in the moment:
`transferActuallySucceeded: true` leaves the claimed orders exactly as they are (they genuinely
were paid); `false` releases them back to the unpaid pool so the next Monday run retries them.

**Frontend**: restaurant owners see a "Payout history" section on their existing Earnings page
(`dashboard/restaurants/[id]/earnings`) alongside the pre-existing revenue/onboarding UI; riders
get the same section added to their deliveries page. Stores get a new, minimal
`dashboard/stores/[id]/payouts` page — history only, no revenue breakdown (there's no store
equivalent of `OrdersService.getEarningsSummary` yet, a separate pre-existing gap this ticket
doesn't fix) and an explicit "onboarding isn't available yet" notice, since store payout-account
onboarding doesn't exist until FDP-94. Admins get a new "Payouts" tab: the existing manual-batch
trigger, filterable list, and a resolve-reconciliation modal that makes the admin explicitly
choose "it did / did not go through" rather than a single ambiguous "resolve" button — the whole
point of `reconciliationRequired` is that this determination has to come from a human who actually
checked, not from this system guessing.

**Deliberately out of scope, staged for later tickets**: store/rider payout-account onboarding
(FDP-94 — until then, their payout history sections/pages will legitimately stay empty, which is
expected, not a bug) and the actual cutover of §14's instant charge-time split (a later ticket,
once onboarding exists for every vendor type and the dashboards built here have had a chance to
prove the batch out in practice).

## 21. Store & rider payout onboarding (docs/ROADMAP.md FDP-94)

Extends every payout-account onboarding flow (§4's Paystack/Flutterwave/Stripe Connect
onboarding, previously restaurant-only since FDP-52/53/54) to stores and riders, closing the gap
§20 called out — this is what actually lets a store or rider receive a real weekly payout, not
just see an (until now, empty) history for one.

**Stores** mirror restaurants exactly — `StoresService.setPayoutAccount`/
`setPayoutAccountFromWebhook`/`findByPayoutAccountReference` are the same three methods
`RestaurantsService` already had, and `PaystackPayoutsController`/`FlutterwavePayoutsController`/
`StripePayoutsController` each gained a `stores/:storeId/payout/...` route group alongside their
existing `restaurants/:restaurantId/...` one, same ownership-check pattern
(`StoresService.assertOwnerOrAdmin`).

**Riders are self-service only** — `riders/me/payout/...` (no id param), since a rider has no
separate `ownerId` the way a restaurant/store does (the rider IS the account owner;
`PayoutAccount`'s own doc comment already called this out at FDP-91).
`RidersService.setPayoutAccount` takes a `userId`, not a rider id, resolving the rider profile
via the same `findMine` every other rider "me" endpoint uses. Two rider-specific differences from
the restaurant/store flow: (1) `businessEmail` for Flutterwave/Paystack's subaccount APIs comes
straight from the access token (`user.email`) rather than a separate owner lookup, since a rider
IS the authenticated caller; (2) the subaccount's stored default split (Paystack
`percentageCharge`, Flutterwave `splitValue`) is `0`, not the platform's 15% commission — riders
keep 100% of their delivery fees, so nothing about a rider's payout account should ever cause a
provider to withhold a cut on their behalf. The rider onboarding forms on `/rider/deliveries`
also skip the currency-availability gate the restaurant/store forms use
(`GET /payments/providers?currency=...`) — unlike a restaurant/store, a rider isn't tied to one
seller's currency, so all three providers' forms are simply offered until one succeeds.

**Stripe Connect's webhook got genuinely more complex**, not just extended —
`PaymentsService.handleStripeAccountWebhook` previously only ever looked up a Stripe account
reference against `RestaurantsService`. It now checks Restaurant, then Store, then Rider in turn
(a Stripe account belongs to exactly one), since the webhook identifies the account only by its
Stripe id, never by which vendor type owns it. This is a rare event, not a hot path, so up to
three sequential lookups cost nothing that matters.

Frontend: the restaurant Earnings page's three onboarding forms
(`PaystackPayoutSetup`/`FlutterwavePayoutSetup`/`StripePayoutSetup`) are duplicated (not shared
via a generalized component) onto the new `dashboard/stores/[id]/payouts` page and the rider
deliveries page — deliberately, matching this codebase's general preference for a second
straightforward copy over a premature shared abstraction when the three shapes are similar but
not identical (different mutations, different ownership/currency assumptions). No new translation
keys were needed — every onboarding form reuses the existing `EarningsPage` namespace's copy
verbatim, since the actual onboarding *steps* (pick a bank, verify, connect / redirect to Stripe)
are identical regardless of vendor type.
