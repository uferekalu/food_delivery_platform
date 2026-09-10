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

Vendor payouts (a weekly platform-driven transfer, not a charge-time split) are §14/§18–21.

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
`/auth/refresh` (and `/auth/logout`, same cookie) are the only cookie-authenticated endpoints
(everything else uses the Bearer-token access token, which a cross-site page can't read or
attach), so the actual CSRF exposure is narrow — a forged request to either can at worst rotate
or end the victim's own session, never anything higher-value. Revisit with a double-submit token
if that risk profile changes. Re-confirmed rather than just re-asserted in docs/ROADMAP.md
FDP-99: the cookie-options logic was pulled into an exported `buildRefreshCookieOptions()`
(`auth.controller.ts`) specifically so both the production and non-production attribute sets are
directly unit-tested (`auth.controller.spec.ts`), plus a real end-to-end `Set-Cookie` header
assertion in `auth.e2e-spec.ts` — so a future accidental loosening of `httpOnly`/`secure`/
`sameSite`/`path` fails a test instead of shipping silently.

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

Every order's full amount settles to the platform's own account at charge time — no split, no
destination charge, no subaccount routing. A vendor's cut is paid out separately, weekly, by
§19's transfer execution engine, straight into whichever payout account they've onboarded below.
The platform never holds customer funds and manually disburses them outside that scheduled batch
— no in-house wallet or ad-hoc transfer queue.

This wasn't the original design. docs/ROADMAP.md FDP-51 through FDP-54 built an **instant
charge-time provider split** — the restaurant's share settled automatically via the payment
provider's own split/connected-account mechanism, in the same transaction as the charge. FDP-91
through FDP-95 replaced it with the weekly-batch model this section now describes, as a
deliberate staged rollout rather than a single cutover: FDP-91 laid the ledger foundation (§18),
FDP-92 built real transfer execution (§19), FDP-93 added dashboards (§20), FDP-94 extended
onboarding to stores and riders (§21), and FDP-95 was the actual cutover — removing the
charge-time split calls this section used to document. `Order.settledViaInstantSplit` (§19) is
the seam between the two eras: `true` on historical orders the old mechanism genuinely already
paid (excluded from the weekly batch forever, so they're never paid twice), always `false` on
every order created after the cutover (since the mechanism it names no longer runs).

**Commission model.** `PLATFORM_COMMISSION_RATE` (`backend/src/common/constants/platform-fee.ts`,
currently 15%) is a single shared constant applied to the order's food `subtotal` only — never
`deliveryFee` (the rider's own earnings, paid at 100%, see §18/§19) or `serviceFee` (already the
platform's direct revenue line). `OrdersService.createOrder` snapshots the result onto every
order as `platformFeeAmount`/`restaurantPayoutAmount` at creation time, so a later rate change
never rewrites historical orders. `OrdersService.getEarningsSummary` sums these over a
restaurant's `DELIVERED` orders for its dashboard; `PayoutsService`/`PayoutExecutionService` (§18–
19) are what actually turn that owed amount into a real transfer.

**Per-provider onboarding** is the only piece of the original design that's unchanged in shape,
because it's what the weekly batch now depends on entirely — `Restaurant.payoutAccounts` (and,
since FDP-91/94, `Store.payoutAccounts`/`Rider.payoutAccounts`) holds one entry per payment
provider a vendor has connected — `{ provider, status: 'pending' | 'active', reference, bankCode,
accountNumber }`, mirroring the multi-provider reality `PaymentProviderResolver` already models
(a customer can override the currency's default provider per order, so a vendor's payout coverage
has to cover more than just its default). Until a provider has an `active` entry, the weekly batch
simply has nowhere to send that provider's earnings yet — they accrue, unpaid, until it does.

**Paystack (FDP-52, extended FDP-94).** A vendor supplies a bank + account number
(`PaystackPayoutsController`); the backend resolves it via Paystack's `/bank/resolve` (confirms
the account name before anything is created — the cheapest fraud/typo guard available) and
creates a subaccount via `/subaccount`, storing the resulting `subaccount_code` as the payout
account's `reference`. That subaccount is never used for a charge-time split anymore — its only
remaining job is being the target of a real weekly `PaystackAdapter.transfer()` call (§19), which
creates a `type: 'subaccount'` transfer recipient from that same reference and pays it directly,
no bank details required at transfer time.

**Flutterwave (FDP-53, extended FDP-94)** follows the same subaccount-onboarding shape as
Paystack (confirmed live against the Flutterwave sandbox), but — unlike Paystack — its Transfers
API has no "pay this subaccount" call, only a standalone bank transfer. So `bankCode`/
`accountNumber` (resolved during onboarding, same as Paystack) are persisted on the
`PayoutAccount` entry itself and used directly by `FlutterwaveAdapter.transfer()` (§19); the
`subaccount_id` from onboarding is kept for reference but plays no role in the weekly transfer.

**Stripe Connect (FDP-54, extended FDP-94)** — Express accounts, structurally different from the
other two: no single API call produces a usable account. Each `StripePayoutsController` endpoint
(one per vendor type) creates a connected Express account (once — reused on every later call,
keyed off the vendor's existing `payoutAccounts` entry) and always returns a fresh Account Link
(these expire within minutes, confirmed live against the sandbox) to redirect the vendor to
Stripe's own hosted onboarding; bank details never touch this backend. The account starts
`pending` and stays that way — even after the browser lands back on `return_url` — until Stripe's
`account.updated` webhook confirms `charges_enabled && details_submitted`, the only reliable
completion signal. That webhook shares `/payments/webhooks/stripe` with the existing
`checkout.session.completed` handler — a Stripe account has one webhook URL for every subscribed
event type — and, since FDP-94, checks Restaurant, then Store, then Rider in turn for a matching
account reference (a rare lookup, not a hot path). Once `active`, `StripeAdapter.transfer()` (§19)
moves money to that connected account directly — a standalone `stripe.transfers.create`, not a
destination charge — confirmed live that Stripe rejects a transfer to an account still missing
the `transfers` capability, the same gate this codebase already relied on for the old
destination-charge model and continues to rely on now.

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

**The double-pay guard is the load-bearing piece of this ticket.** At the time this ticket shipped,
§14's original instant charge-time split was still live and unmodified (the cutover was FDP-95,
three tickets later) — a restaurant with an active payout account for a given provider already
got paid automatically, at charge time, by that mechanism. Before this ticket, nothing
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
doesn't fix) and, as of this ticket, an explicit "onboarding isn't available yet" notice, since
store payout-account onboarding doesn't exist until FDP-94 (that notice — and the onboarding
forms replacing it — is what FDP-94, §21, actually added). Admins get a new "Payouts" tab: the existing manual-batch
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

## 22. "Near me" geolocation discovery (docs/ROADMAP.md FDP-96)

Real "restaurants/stores near me" discovery using MongoDB's native geospatial query support
(`$geoNear` + a `2dsphere` index), not an in-memory haversine sort — `$geoNear` can filter by
radius and paginate at the database level, which a plain `.find()` plus manual distance
calculation can't do without loading every candidate document into memory first.

**New `Address.location` field, alongside `lat`/`lng`, not replacing them.** A new
`GeoPoint` subschema (`{ type: 'Point', coordinates: [lng, lat] }` — longitude first, GeoJSON's
own fixed convention, the reverse of how `lat`/`lng` are ordered everywhere else in this
codebase, called out explicitly in code comments so it's never silently gotten backwards) is
synced onto `Address.location` by a new `toGeoPoint(lat, lng)` helper (`common/utils/geo.ts`,
alongside the pre-existing `haversineDistanceKm`) whenever a restaurant/store is created or
updated. It returns `null` (never throws) when either coordinate is missing — a restaurant/store
that's never set coordinates simply never appears in "near me" results, the same graceful-
fallback precedent §15's delivery-fee calculation already established for missing geo data.
`RestaurantSchema`/`StoreSchema` each index `'address.location'` as `2dsphere`.

**Dedicated `GET /restaurants/nearby` / `GET /stores/nearby` endpoints, not folded into the
existing list/filter endpoints.** `$geoNear` must be the first stage of an aggregation pipeline,
which doesn't compose with the existing simple `.find().sort().skip().limit()` list endpoints —
reworking those to accommodate it risked regressing already-working browse/filter behavior for
no benefit, so "near me" got its own small-blast-radius endpoint instead. Both are public
(`@Public()`, matching every other browse endpoint) since anonymous visitors need "near me" to
work too, and both are declared before their respective `:slug` route (same declaration-order
requirement as the existing `mine`/`pending`/`admin/:id` routes) so `/nearby` isn't swallowed as
a slug value.

Each service's `findNearby(query)` runs a single aggregation: a `$geoNear` stage (`near: {type:
'Point', coordinates: [lng, lat]}`, `spherical: true`, `distanceField: 'distanceMeters'`,
`maxDistance` from the query's `radiusKm`, filtered to `isApproved: true` and, for stores, the
required `type`) feeding a `$facet` that produces the paginated `items` and a `totalCount` in one
round trip. Results are typed `RestaurantWithDistance`/`StoreWithDistance` (the base type plus a
rounded `distanceKm`) — a shape that only ever exists on a `/nearby` response, never stored.
`NearbyQueryDto` (`common/dto/`) validates `lat`/`lng` (`@IsLatitude`/`@IsLongitude`), an optional
`radiusKm` (0.5–50, default 10) and pagination; `NearbyStoresQueryDto` extends it with a required
`type`, mirroring `ListStoresDto`'s existing "a category listing always picks exactly one type"
rule (§17).

**Frontend**: a new `useGeolocation()` hook (`lib/geolocation.ts`) wraps the browser Geolocation
API behind an explicit `request()` call — it never fires `getCurrentPosition()` on mount, since
prompting for location before the visitor has any context is a well-documented way to get the
permission reflexively denied. Errors are mapped from the three stable
`GeolocationPositionError` codes to a translatable `"denied" | "unavailable" | "timeout"` union
(plus `"unsupported"` for browsers without the API at all). The new `/near-me` page gates on this
hook's state: an "enable location" prompt until coordinates are obtained, then a `Tabs` layout
(Restaurants / Groceries / Pharmacy & more, mirroring `/categories`) each calling
`useGetNearbyRestaurantsQuery`/`useGetNearbyStoresQuery` and rendering the existing
`RestaurantCard`/`StoreCard` with their new optional `distanceKm` prop (shown as "• *N* km away"
alongside the existing estimated-delivery-time line). A "Near me" link sits in the homepage
hero's CTA row alongside the existing browse/partner links.

A 2dsphere index gotcha worth knowing for future geo-query tests: Mongoose's `autoIndex` builds
an index in the background, non-blocking, on model compile — a `$geoNear` query issued against a
freshly-connected `mongodb-memory-server` before that index finishes building fails with "unable
to find index for $geoNear query." Both new service spec files call `await
restaurantModel.init()` / `await storeModel.init()` in `beforeAll` to wait for it explicitly.

## 23. Reorder / "buy again" (docs/ROADMAP.md FDP-97)

`POST /orders/:id/reorder` rebuilds the customer's cart from a past order's items in one call,
rather than the frontend looping over the existing per-item `addItem`/`addStoreItem` endpoints —
that would duplicate re-validation logic per call and trip the same cross-seller 409 conflict on
every line instead of once for the whole order. `OrdersController.reorder` delegates to
`OrdersService.reorder`, which reuses the existing ownership-checked `findOne` (so a customer can
only reorder their own order — a `ForbiddenException` otherwise) and hands the hydrated
`OrderDocument` straight to a new `CartService.reorderFromOrder`.

**`reorderFromOrder` never trusts the order's frozen snapshot for anything that can have drifted
since the order was placed.** An order's `price`/`selectedModifiers` are a point-in-time receipt,
not a quote — so price is re-read from the current `MenuItem`/`Product`, and modifiers are
re-resolved against the item's *current* `modifierGroups` via the same private `resolveModifiers`
`addItem` already uses. A line whose item was deleted, is now `isAvailable: false`, or whose old
modifier picks no longer resolve (a required group added since, an option removed) is silently
dropped rather than failing the whole reorder — its name comes back in a `skippedItems` array so
the frontend can tell the customer their cart doesn't fully match the original order. If every
line gets dropped, or the order's restaurant/store is no longer approved/open, the whole call
fails with a `BadRequestException` instead of silently handing back an empty cart.

**Mirrors `addItem`/`addStoreItem`'s own replace-confirmation gate**, generalized from "adding an
item from a different seller" to "rebuilding the whole cart from an order": a cart that already
has items needs `replace: true` (a `ConflictException` otherwise) — the same 409-then-confirm
pattern the frontend's `item-detail-modal.tsx` already handles for a cross-seller add is reused
verbatim on the order detail page's new "Reorder" button.

`CartService.reorderFromOrder`'s order parameter is typed as a structural `ReorderSourceOrder`
interface (declared in `cart.service.ts`) rather than importing `OrderDocument` from
`orders/schemas/order.schema` — `OrdersModule` already imports `CartModule` (it clears/reads the
cart when creating an order), so a real import the other way would be circular. An `OrderDocument`
satisfies the structural shape without any adapting, so `OrdersService.reorder` passes one
through directly.

Frontend: a "Reorder" button sits in the order detail page's Items card header
(`orders/[id]/page.tsx`), calling a new `useReorderMutation`. Its confirm-replace modal is a
direct copy of `item-detail-modal.tsx`'s "start a new cart?" dialog (same 409-detection helper,
same footer buttons) — deliberately duplicated rather than extracted into a shared component,
since the two are one small, self-contained dialog each, not a signal to abstract yet. On success
it navigates to `/checkout` (with a toast if some items were skipped) — "buy again" is meant to
get the customer moving again quickly, and checkout already reads whatever the cart resolves to.
**Superseded by §27**: once a second call site (the orders list) needed the identical button, it
was pulled into a shared `components/reorder-button.tsx` — see §27.

## 24. Algorithmic nearest-rider dispatch (docs/ROADMAP.md FDP-98)

Before this ticket, a `READY_FOR_PICKUP` order just sat in `findUnassignedForRiders`'s
platform-wide queue until *any* online rider happened to open the app and tap "Accept" — no
notion of distance at all, despite the name "FIFO" some earlier docs used for it. This ticket adds
a real first attempt at the closest eligible rider, on top of (not instead of) that manual queue:
the queue is now purely the fallback for whenever automatic dispatch finds nobody.

**New `Rider.currentLocation`/`locationUpdatedAt` fields**, reusing FDP-96's `GeoPoint`/
`GeoPointSchema` pattern verbatim, plus a `2dsphere` index on `currentLocation`. Unlike a
restaurant/store's `address.location` (geocoded once from a fixed business address), a rider's
location has to be kept live — it's written by the realtime gateway's existing
`rider:locationUpdate` handler (docs/ROADMAP.md FDP-17), which previously only ever relayed a
rider's GPS ping to the customer's tracking map during an active delivery and threw it away
otherwise ("deliberately not persisted anywhere" per its old doc comment). It now persists onto
`Rider.currentLocation` unconditionally — an idle-but-online rider's location matters just as much
to dispatch as an in-delivery one's matters to the tracking map — while the order-room broadcast
still only fires when the rider actually has something in flight to relay it to. Frontend: the
rider dashboard's `LocationSharingToggle` (a manual opt-in `Switch`, never auto-requesting
`watchPosition` per this codebase's standing "no silent geolocation prompts" rule) is now shown
any time the rider is online, not only once they have an active delivery — a rider who leaves it
off simply stays invisible to dispatch and falls back to the manual queue, the same graceful
degrade FDP-96 established for a seller with no coordinates at all.

**Dispatch lives in `OrdersService`, not `RidersService`**, despite being entirely about riders —
`RidersModule` already imports `OrdersModule` (self-assign calls `OrdersService.assignToRider`),
so `OrdersModule` importing `RidersModule` back would be circular. `OrdersService` instead injects
the `Rider` Mongoose model directly (registered a second time in `OrdersModule`'s own
`MongooseModule.forFeature`, the same "inject the model, not the module" workaround
`RealtimeGateway` already established for its own circular-dependency corner) rather than calling
through `RidersService` at all.

`OrdersService.applyOwnerTransition` — the shared tail every owner-triggered status change already
runs through — calls a new, awaited `dispatchToNearestRider(order)` specifically on the
`READY_FOR_PICKUP` transition. `dispatchToNearestRider` never throws: it swallows its own errors
(missing seller coordinates, nobody nearby, a transient DB error) and resolves `null`, so a
dispatch failure can never fail the transition that already committed above it — but unlike
`notifyOrderStatus`'s fire-and-forget posture, it *is* awaited, so if it succeeds the owner's own
`PATCH .../status` response already reflects the assigned rider instead of momentarily looking
unassigned until the next refetch.

The actual query, `findNearestAvailableRiderId`, is `$geoNear` over `Rider.currentLocation`
(`query: { isOnline: true, isVerified: true }`, `maxDistance` capped at 15km) — the same
database-level radius filtering FDP-96 established for restaurant/store "near me" search, reused
here for the identical reason (an in-memory haversine sort over every online rider doesn't scale,
and a rider who's never shared a location is silently excluded rather than erroring, since
`$geoNear` can't match a document with no valid geo field for its 2dsphere index). The nearest 15
candidates are pulled before filtering: a single follow-up `Order.distinct('riderId', {riderId:
{$in: candidateIds}, status: {$in: ACTIVE_DELIVERY_STATUSES}})` computes which of them are already
mid-delivery, and the first candidate not in that busy set — still nearest-first, since `$geoNear`
already sorts by distance — is the one dispatched. `ACTIVE_DELIVERY_STATUSES` moved to a single
exported constant in `orders/schemas/order-status.ts`, replacing what used to be two independently
maintained copies (one in `RealtimeGateway`, needed again here) that could have silently drifted
apart.

**Distance is measured from the seller's address, not the customer's delivery address** — the
rider has to reach the restaurant/store first — reusing whichever `address.location` FDP-96
already geocoded and kept in sync, rather than recomputing it. A restaurant/store that's never
had its address geocoded simply can't be dispatched to (falls back to the manual queue), the same
graceful precedent FDP-96 already established for "near me" search on the customer side.

## 25. Web push notifications (docs/ROADMAP.md FDP-100)

A fourth notification channel alongside the existing in-app/email/SMS fan-out — delivers a real
OS-level notification even with no tab open, via the browser's Push API and a minimal service
worker (`frontend/public/sw.js`, push-only, no manifest/installability — PWA installability
stays explicitly out of scope, see FDP-22's note). No real VAPID key pair exists for this project
yet; generate one with `npx web-push generate-vapid-keys`.

**`PushService` mirrors `SmsService`'s graceful-degradation pattern exactly**: `VAPID_PUBLIC_KEY`/
`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` are read via `ConfigService.get()` (undefined, not thrown, if
unset), `isConfigured` is computed from all three being present, and `send()` logs and no-ops
rather than throwing when they're not — so the rest of `NotificationsService.notify()`'s fan-out
is never blocked by a missing push provider, same as every other optional integration in this
codebase (Termii, Sentry, Google/Facebook OAuth).

**Unlike email/SMS, push is attempted unconditionally on every `notify()` call**, not opted into
per call site — `NotifyInput` gained only an optional `pushUrl` (the service worker's
`notificationclick` target, defaulting to `/notifications`), reusing the same `title`/`body`
every call already provides rather than requiring every existing `OrdersService` call site to
also pass push-specific copy. `PushService.send()` itself decides whether the user actually has
a subscription; a push attempt is deliberately **not** recorded in `Notification.channels`
(unlike `'email'`/`'sms'`) — checking subscription existence synchronously just to populate that
cosmetic list isn't worth an extra DB round trip on every single notification.

**One `PushSubscription` document per browser/device, not per user** (a new, separate collection
from `Notification` — `endpoint` is the natural dedup key, upserted on): a customer can have the
feature on across a work laptop, a home laptop, and a phone browser simultaneously, unlike
`User.phone` for SMS which is a single value. A push service returning 404/410 (the browser
itself unsubscribed, or the endpoint expired) deletes that one subscription; any other error is
logged and the subscription left alone, since a transient outage isn't evidence the subscription
itself is bad.

**Frontend**: `usePushNotifications()` (`lib/push-notifications.ts`) mirrors `useGeolocation()`'s
on-demand-only shape — the service worker is registered and the browser's permission prompt is
requested only from an explicit `subscribe()` call (a "Enable push notifications" toggle on
`/notifications`), never automatically on mount, for the same "don't get reflexively denied"
reason FDP-96 already established. A VAPID public key arrives base64url-encoded but
`pushManager.subscribe()`'s `applicationServerKey` needs a raw `Uint8Array`, converted client-side
(`urlBase64ToUint8Array`) — fetched from the backend (`GET /notifications/push/public-key`, `null`
when unconfigured, in which case the toggle stays hidden) rather than duplicated into a
`NEXT_PUBLIC_*` env var, keeping the VAPID key pair single-sourced on the backend.

## 26. Real tax calculation (docs/ROADMAP.md FDP-101)

Replaces the flat `tax: 0` placeholder `Order.tax` carried since FDP-11 ("jurisdiction-specific
rules vary too much to fake meaningfully at this stage") with a real, working, currency-keyed VAT
calculation — scoped honestly, not as a full nexus/jurisdiction-aware tax engine (unrealistic to
build accurately for arbitrary jurisdictions), but as a single flat national rate per currency,
the same scope a small marketplace platform can actually keep correct.

**New `TaxResolver`** (`orders/tax-resolver.ts`) follows `PaymentProviderResolver`'s exact
established config-table convention (docs/ARCHITECTURE.md §4): a plain `Record<string, number>`
keyed by currency (uppercased on lookup), a `DEFAULT_TAX_RATE` fallback, no DB/config-service
indirection — a new currency/rate is a table edit, not a code change. Seeded with each currently-
supported currency's one real-world country's standard national VAT rate (Nigeria 7.5%, Ghana
15%, Kenya 16%, South Africa 15%, Uganda 18%, UK 20%) — a starting point, not a live regulatory
feed; **the table's own doc comment is explicit that these need verifying against current law
before relying on them in production**, since tax rates change and nothing here refreshes
automatically. `USD`/`EUR` are deliberately left out of the table (falling through to the 0
default) rather than assigned a number: neither identifies one jurisdiction with a single
accurate flat rate (US sales tax is state/county-variable with no national rate; Eurozone
national VAT rates range roughly 17–27%), so stating a number for either would be actively wrong
rather than approximately right — the same "don't fake accuracy" reasoning the original `tax: 0`
placeholder's own doc comment already gave.

**Tax is computed on the post-discount taxable amount** — `subtotal + deliveryFee + serviceFee -
discount` — standard VAT practice, since tax applies to what the customer is actually charged,
not the pre-discount list price. This required moving the `tax` calculation in both
`OrdersService.createRestaurantOrder`/`createStoreOrder` to *after* promo-code validation
resolves `discount` (it was previously computed — as the literal `0` — before discount, since
order didn't matter when the value was always zero); the `total` formula itself
(`subtotal + deliveryFee + serviceFee + tax - discount`) needed no change, since `tax` was
already wired in as an additive term. Clamped at 0 so a discount larger than the pre-tax total
can't produce negative tax (the same clamp `total` itself already has).

**Frontend**: the checkout page's existing client-side fee-preview pattern (a duplicated
`DELIVERY_FEE_RATE`/`SERVICE_FEE_RATE` constant, explicitly documented as "preview only, the
authoritative total always comes from the created order") gained a duplicated `TAX_RATE_TABLE`
for the same reason — a new "Tax (est.)" summary line, hidden entirely when the rate is 0 (most
checkouts, given USD/EUR's default) rather than showing a redundant "$0.00 tax" row.

## 27. Store earnings/sales-report parity + discoverability fixes (docs/ROADMAP.md FDP-102)

Three user-reported gaps, all found from live app screenshots rather than a code audit: stores
(groceries/pharmacy) had no earnings or sales-report pages though restaurants did; "near me" had
no discoverable entry point anywhere in the app despite shipping in §22; and the orders list page
had no reorder affordance even though §23 put one on the order detail page.

**Earnings/sales-report parity** follows the same seller-type-generalization pattern §17's
`DeliveryZonesService`/`PromoCodesService` established (`sellerType: 'restaurant' | 'store'` as
the leading argument) — applied here to three `OrdersService` methods
(`getEarningsSummary`/`getSalesReport`/`getSalesReportOrders`) and their shared
`deliveredOrdersMatch` helper that FDP-90's own "seller parity" pass never touched, since none of
the three existed at restaurant-only launch and nobody had circled back. A new private
`findSellerOrThrow(sellerType, sellerId, requester)` centralizes the ownership-checked fetch,
returning a minimal structural type (`{ _id, currency, payoutAccounts }`) rather than importing
either concrete document type — both satisfy it as-is. `OrdersController` gained a `store/:storeId/…`
twin of each existing `restaurant/:restaurantId/…` route, declared before the generic `:id` route
like every other seller-scoped route pair in this controller. The sales-report CSV export's
"Restaurant payout" column header became the generic "Seller payout", matching
`restaurantPayoutAmount`'s own established "legacy field name, correct for either seller type"
precedent. Frontend: `dashboard/stores/[id]/payouts/page.tsx` was deleted outright, its full
payout-setup-form content folded into a new `dashboard/stores/[id]/earnings/page.tsx` alongside
the previously-missing revenue-stats section, plus a new `dashboard/stores/[id]/sales-report/page.tsx`
— both mirror their restaurant equivalents structurally, layering a small `StoreEarningsPage`/
`StoreSalesReportPage` translation namespace over the existing shared `EarningsPage`/
`SalesReportPage` namespace (already store-agnostic since FDP-94 reused it verbatim) for the
handful of strings that do differ (not-found copy, "in your catalog" vs. "in your menu").

**"Near me" discoverability** went through three iterations driven directly by user feedback
rather than original design judgment. First attempt added a link to the persistent header nav
(`app-shell.tsx`) and the mobile drawer — rejected: the header nav is already congested and
another item there would make it worse. Second attempt considered the `/categories` page —
abandoned before any JSX was written once the user circled a specific, different spot in a
screenshot: directly beside the homepage hero's search box. Final placement pairs a new "Near me"
pill `Link` with `HeaderSearch` inside one `hidden sm:flex` wrapper in the hero's top row: same
visibility breakpoint as search itself, so neither appears alone below `sm`. The pre-existing
"Near me" link in the hero's button-row CTA gained `sm:hidden` so mobile still gets an entry point
once the paired desktop one disappears — avoiding showing "Near me" twice on desktop.

**Reorder discoverability**: the `ReorderButton` (§23) only lived on the order detail page, one
click deep from the orders list where a customer scanning past orders would actually look for it.
Extracted from a local function in `orders/[id]/page.tsx` into an exported
`components/reorder-button.tsx` (superseding §23's "not worth abstracting yet" call — a second
call site was exactly the signal to revisit that) and added to every card on `orders/page.tsx`.
Required restructuring `OrderRow`: the whole card could no longer be one big `Link` wrapper once
it needed an interactive button inside it (a `<button>` nested in an `<a>` is invalid HTML) — the
clickable "view details" region is now its own `Link` around just the summary row, with the
`ReorderButton` sitting below as a sibling `<div>`, outside the anchor entirely. Its `onClick`
calls `preventDefault`/`stopPropagation` defensively even though it's no longer nested inside the
`Link`, since a future layout change could put it back inside one.

## 28. Payment system hardening: refund clawback, ambiguous-outcome handling, out-of-band detection (docs/ROADMAP.md FDP-104)

A full audit of the payment system (commission model, weekly payouts, refunds), requested after
the platform's earlier tickets — see docs/ROADMAP.md FDP-14/49/50/59/65 for payments,
FDP-91-95 for the weekly payout batch. Two things were confirmed already correct with no changes
needed; the real gaps were all in refunds.

**Commission — already correct, confirmed not rebuilt.** `PLATFORM_COMMISSION_RATE = 0.15`
(`common/constants/platform-fee.ts`) is applied identically to every restaurant and store order's
food subtotal (`platformFeeAmount = subtotal * 0.15`, `restaurantPayoutAmount = subtotal -
platformFeeAmount`, both snapshotted on the `Order`). Riders keep 100% of `deliveryFee`. This
already matches a standard marketplace commission model (customer pays subtotal + delivery +
service fee; platform keeps its commission plus the service fee; vendor gets the rest) at exactly
15%. Three stale doc-comments on `Order` (referencing pre-FDP-15/90/92/101 placeholder behavior —
flat delivery fee, "tax always 0", "commission... informational only") were corrected as part of
this pass, no logic changes.

**Weekly Monday payout batch — already robust, one coverage gap closed.** `PayoutExecutionService`
(FDP-92) already had atomic order-claiming, confirmed-rejection-vs-ambiguous-outcome handling, and
per-vendor error isolation. Added an explicit test that runs `runWeeklyBatch()` twice in sequence
and asserts the second run pays nothing new — the guarantee already existed structurally (the
atomic claim), it just hadn't been asserted directly.

**The refund clawback ledger — the actual new mechanism.** Refunding an order whose vendor cut had
already been paid out by a previous weekly batch previously caused no clawback, no flag, and no
record — the platform silently absorbed the loss. New `PayoutClawback` schema
(`payouts/schemas/payout-clawback.schema.ts`) records exactly this: `{ vendorType, vendorId,
orderId, originalPayoutId, provider, currency, amount, remainingAmount, status }`. Deliberately
`restaurant`/`store` only, never `rider` — a rider keeps their delivery fee regardless of a later
food-related refund, since they already performed the delivery.

Created by `OrdersService.finalizeRefund` (via a private `recordVendorClawbackIfNeeded` step) the
moment a refund actually completes, if `order.vendorPayoutId` was already set — putting the check
inside `finalizeRefund` itself (rather than in `PaymentsService.refundOrder`) means every caller of
`finalizeRefund` gets clawback protection automatically, including the out-of-band webhook path
below, with nothing to remember per call site. If the order was never paid out (the common case —
most refunds happen well before the next Monday), its `REFUNDED` status already excludes it from
`PayoutsService.getUnpaidVendorEarnings` on its own; no clawback needed.

**Module-boundary note**: `PayoutsModule` already imports `PaymentsModule` (to reuse the provider
adapters for transfers), so `PaymentsModule` cannot import `PayoutsModule` back. The clawback write
path therefore lives in `OrdersService` (which `PaymentsModule` already depends on via
`OrdersModule`), with `OrdersModule` registering its own `MongooseModule.forFeature` entry for the
`PayoutClawback` schema — the same "reuse the schema, not the owning module" pattern `PayoutsModule`
already used for `Order`. `PayoutsService`/`PayoutExecutionService` register the same schema again
on the read/consume side; nothing about a shared Mongoose schema registered in two modules is new
here.

**Consuming a clawback** happens in `PayoutsService.getUnpaidVendorEarnings`: after building each
`(provider, currency)` earnings group as before, `applyClawbacks` nets that vendor's `pending`
clawbacks for the same `(provider, currency)` against it — oldest first, greedily consumed, capped
so the net amount can never go negative. `UnpaidEarningsGroup` gained `rawGrossAmount`,
`clawbackDeducted`, and `clawbackConsumption` (which clawback ids were consumed, by how much) —
all computed live from each clawback's current `remainingAmount`, never snapshotted, so an
unconsumed remainder simply carries forward and keeps being deducted from subsequent weeks with no
extra state. `PayoutExecutionService.executePayout` decrements each consumed clawback's
`remainingAmount` (flipping it to `fully_applied` at zero) **only** on a confirmed successful
payout — never on a rejected or ambiguous attempt, since nothing was actually recovered in that
case. A clawback that fully absorbs a week's raw earnings (net `grossAmount` of 0) still needs its
orders claimed and the clawback decremented, just with no actual provider transfer — handled as an
immediate-success, zero-transfer branch rather than being skipped the way a genuinely-empty group
is (`attemptGroup`'s skip condition changed from `grossAmount <= 0` to `orderIds.length === 0`).
`Payout.clawbackDeducted` (new field) records how much was withheld, so a vendor's payout history
shows *why* a payout was smaller than their gross earnings that week.

**Ambiguous refund outcome — mirrors the payout side's `TransferOutcomeUnknownError` design.** New
`RefundOutcomeUnknownError` (`payments/adapters/refund-outcome-unknown.error.ts`), thrown by each
adapter's `refund()` on a network-layer failure (never on a confirmed provider rejection, which
stays a plain `Error` exactly as before). `PaymentsService.refundOrder` catches it distinctly:
instead of `revertFailedRefundClaim` (which would falsely imply nothing happened), it calls
`OrdersService.flagAmbiguousRefund`, which reverts `status` to its pre-claim value (the order never
falsely shows REFUNDED) but sets new `Order.refundReconciliationRequired`/`refundFailureReason`
fields. `claimForRefund`'s own filter now excludes `refundReconciliationRequired: true`, so a
blind retry is structurally blocked, not just discouraged — an admin must resolve it first via
`OrdersService.resolveRefundReconciliation(orderId, refundActuallySucceeded)` (`true` finalizes the
refund for real, clawback check included via the same `finalizeRefund` choke point; `false` just
clears the flag), exposed as `PATCH /payments/:orderId/resolve-refund-reconciliation` — the same
shape as `PayoutExecutionService.resolveReconciliation`. Stripe's `refund()` also gained an
idempotency key (`refund:${paymentRef}`, mirroring `transfer()`'s existing one) and no longer
silently no-ops when a checkout session has no payment intent (it now throws — `refundOrder` only
ever calls this on an already-succeeded payment, so a missing payment intent means something
upstream is wrong, not a safe-to-ignore case).

**Out-of-band refund/dispute detection** — a refund issued directly in a provider's dashboard, or a
customer's bank filing a chargeback, previously never touched `Order.paymentStatus` at all, since
that only ever changed via `refundOrder`'s own code path. New `PaymentsService.handleRefundWebhook`
(called unconditionally alongside the existing webhook handlers, same "one URL, multiple event
types, each parse safely no-ops on the others" pattern the Stripe Connect account webhook already
uses) resolves the order and, for a refund, reuses the exact `claimForRefund`/`finalizeRefund` pair
the manual admin flow uses — idempotency and concurrency safety (including against a *simultaneous*
admin-triggered refund) come for free. For a dispute, it only sets a new informational
`Order.disputeFlagged` and notifies admins — this codebase never submits dispute evidence, an admin
handles the actual dispute directly in the provider's dashboard.

Provider coverage is asymmetric, honestly documented rather than guessed: **Stripe** (`charge.
refunded`/`charge.dispute.created`) is fully confirmed against Stripe's own docs — the event's
Charge object only carries `payment_intent`, not the checkout session id, resolved via
`checkout.sessions.list({ payment_intent })`. **Flutterwave** (`refund.completed`) is also
confirmed against its official docs, including the `charge_id` → `tx_ref` resolution via `GET
/transactions/{id}/verify` — but Flutterwave does not send refund webhooks by default; enabling
them requires contacting Flutterwave support, an operational prerequisite this code can't satisfy
itself (same class of gap as Paystack's transfer-OTP requirement, backend/CLAUDE.md). No confirmed
Flutterwave dispute event was found. **Paystack** (`refund.processed`, `dispute.create`/`dispute.
remind`) is implemented from third-party documentation only — Paystack's own webhook docs returned
HTTP 403 while building this and could not be directly verified; the parser is defensive (checks
two possible reference-field locations, never throws on an unexpected shape) but is flagged in code
comments as needing verification against a real Paystack sandbox delivery before being fully relied
on in production.

**Admin visibility**: new `OrdersService.findNeedingRefundAttention()` — the union of `{status:
CANCELLED, paymentStatus: succeeded}` (a cancelled order whose charge was never reversed; nothing
else in this codebase prompts an admin to notice this, since cancelling and refunding are two
independent manual actions) and `{refundReconciliationRequired: true}` — exposed as `GET
/orders/admin/needs-refund-attention` and surfaced as a new "Needs attention" section at the top of
the admin Refunds tab (`admin/refunds-tab.tsx`), listing each with a one-click refund or
resolve-reconciliation action depending on which case it is. The same pass also fixed a real,
unrelated bug in that tab found while touching it: its "refundable" check only allowed `DELIVERED`
orders, even though the backend has allowed refunding a `CANCELLED`-with-succeeded-payment order
since FDP-65 — an admin had no way to refund that case through the UI at all despite the API
supporting it.

**Explicitly out of scope**: partial refunds (the whole adapter interface and clawback design
assume a full reversal — a real, larger change, not attempted here) and full chargeback/dispute
lifecycle management (evidence submission stays a manual, out-of-app process).

## 29. Live payout failure fixes: the real Paystack transfer bug, payout clarity, and a vendor-CTA routing bug (docs/ROADMAP.md FDP-105)

Reported directly from production: the first real Monday payout batch against live vendor
accounts came back rejected for every Paystack recipient, with an admin/vendor-facing message too
technical to act on, an admin payout list showing raw vendor ids instead of names, and (a
separate, unrelated report from the same session) an authenticated admin/vendor still being routed
through the customer signup page from several homepage/footer CTAs.

**The real bug — Paystack transfers were never actually possible.** `PaystackAdapter.transfer()`
(since docs/ROADMAP.md FDP-92) created a transfer recipient with `type: 'subaccount', subaccount:
<subaccount_code>`, on the assumption that Paystack's Transfers API could pay a subaccount
reference directly without re-supplying bank details — confirmed, live and against Paystack's own
documented request shape, that `subaccount` is not a valid recipient `type` at all (the only
documented type for a bank-account payout is `nuban`, requiring `account_number`/`bank_code`).
Every real transfer attempt came back rejected with "Either authorization_code or account_number
must be passed" — every vendor's Paystack payout failed from the very first live Monday run, this
wasn't a test-mode restriction. Fixed to match `FlutterwaveAdapter.transfer()`'s own pattern
exactly: a standalone `nuban` recipient built from `PayoutAccount.bankCode`/`accountNumber`.
Because onboarding (`PaystackPayoutsController.setup`/`setupStore`/`setupRider`, FDP-92) already
persisted those two fields correctly all along — only the transfer call itself used the wrong
mechanism — **no re-onboarding was needed for accounts that failed under the old code**; the fix
alone makes the very next Monday run (or an admin "Run batch now") succeed for them.
`PayoutExecutionService.callAdapterTransfer`'s Paystack branch now guards on
`account.bankCode`/`accountNumber` being present (the same guard Flutterwave's branch already
had) rather than `account.reference`.

**Payout failure clarity.** A raw provider error string (`Payout.failureReason`) is accurate but
too technical for either an admin trying to guide a vendor, or the vendor reading their own
earnings page. New frontend-only classifier (`lib/payout-failure-reason.ts`,
`classifyPayoutFailure`) recognizes a handful of common failure shapes (missing bank details,
insufficient platform balance, an unverifiable account, a provider OTP requirement) from the raw
string and maps each to a translated, plain-language explanation — shown *alongside* the raw
reason, never replacing it, on the admin Payouts tab (admin-facing: what to tell the vendor) and
on the restaurant/store earnings pages' and the rider deliveries page's own payout history
(vendor-facing: what to do about it). Classification stays client-side and purely presentational
(translatable copy for a 6-language app is a frontend concern, not something to bake as English
sentences into the backend's `failureReason` field) — the backend keeps recording whatever the
provider actually said.

**Admin payout list showed raw ids, not names.** `PayoutExecutionService.listAll` (the admin
dashboard's only view across every vendor) previously returned bare `Payout` documents —
`vendorType`/`vendorId` only, no way to tell which real restaurant/store/rider a row was about
without looking it up separately. New private `attachVendorNames` resolves each page's unique
vendor ids to a display name in three batched queries (never one query per row), with an extra hop
through `User.name` for riders (`Rider` itself has no name field). Ids that don't parse as a valid
`ObjectId` (or that no longer resolve to a real document) get `vendorName: null` rather than
throwing — defensive against a payout row's vendor record being deleted, or the batched query
itself: Mongoose's `_id: { $in: [...] }` throws a cast error on a malformed id, not a graceful
no-match, so ids are pre-filtered with `Types.ObjectId.isValid()` before ever reaching the query.
`listForVendor` (a vendor's own payout history) doesn't need this — they already know who they are.

**Vendor CTAs silently excluded admin accounts.** The homepage's `partnerCta`/`storeCta` (hero
button + "Let's do it together" cards) and the footer's `restaurantLinks` all branched on
`user.role === "restaurant_owner"` only, sending an authenticated **admin** through
`/register?role=restaurant_owner` — the full customer-facing signup form — exactly like a
logged-out visitor, even though `AuthStatus` (the header nav) has always shown that same admin
their `/dashboard/restaurants`/`/dashboard/stores` links via `role === "restaurant_owner" ||
role === "admin"`. All three now match that same check. Separately hardened `/register` itself:
an already-authenticated visitor landing there by any other route (a stale bookmark, browser
back/forward, an old cached link) is now redirected away in a `useEffect` — a restaurant_owner or
admin goes to `/dashboard/restaurants`, anyone else (customer/rider — no self-service
role-upgrade path exists) goes home, since showing a signed-in visitor someone else's signup form
is confusing regardless of which specific link put them there.

## 30. Scoped support chat widget: knowledge base, support tickets, and a hard human fallback (docs/ROADMAP.md FDP-106)

A floating support chat widget, bottom-right on every page, deliberately **not** a general AI
assistant: it matches a visitor's message against an admin-curated knowledge base of Q&A entries
using deterministic keyword/pattern scoring (no LLM call, no external AI provider), and on a
low-confidence or no match, responds with a warm fallback and logs a support ticket for a human to
follow up — the two failure modes ("confidently answers" / "honestly can't, escalates to a
person") are the entire feature, on purpose.

**Three new backend modules, one new guard.** `knowledge-base/` (admin-only CRUD for `{question,
answer, keywords[], category, isActive}` entries) exposes `KnowledgeBaseService.match(message)`:
normalizes the message (lowercase, strip punctuation via `/[^\p{L}\p{N}\s]/gu`, collapse
whitespace), scores each active entry by keyword substring hits weighted by
`keyword.split(' ').length` (a multi-word phrase like "cancel order" scores higher than a single
word, since it's a more specific signal), and returns the top scorer plus an `aboveThreshold`
boolean against an exported `MATCH_CONFIDENCE_THRESHOLD` constant (same "one tunable constant"
convention as `PLATFORM_COMMISSION_RATE`) — the near-miss entry is kept even below threshold
purely for admin context on the resulting ticket ("the bot almost matched this — maybe broaden its
keywords"), never shown to the visitor. `support-tickets/` (admin-only list/resolve) is created
automatically by the chatbot on a below-threshold match, fans out a `support_ticket_created`
notification to every admin (same batched `usersService.listAll({role:'admin'})` +
`Promise.all(...)`-in-try/catch pattern as every other admin fan-out in this codebase, non-fatal
on failure), and stores exactly one of `userId`/`sessionId` — mirroring `Order`'s existing
`restaurantId`/`storeId` either-or convention — via a small `ChatIdentity` type shared with the
`chatbot/` module. `chatbot/` itself is thin by design: `POST /chatbot/ask` matches-or-tickets and
always appends to a flat, append-only `chat-messages` log purely so `GET /chatbot/history` has
something to replay; `FALLBACK_MESSAGE` is an exported constant so the honest "I don't know, but a
person will follow up" copy lives in exactly one place.

**Guests can use it too — the guard gap that forced a new pattern.** This app had no
guest/anonymous identity concept anywhere before this ticket (cart, orders, everything requires a
real `userId`). Supporting a logged-out visitor meant a route that's public but still reads
`req.user` *if* a valid token was sent — and the existing `JwtAuthGuard` can't do that: when
`@Public()` is set it returns `true` immediately, skipping Passport entirely, so `request.user` is
never populated even with a valid Authorization header. New `OptionalJwtAuthGuard`
(`auth/guards/optional-jwt-auth.guard.ts`) fixes this generically — extends `AuthGuard('jwt-
access')`, overrides `handleRequest` to return `user ?? null` instead of throwing — applied via
`@Public()` + `@UseGuards(OptionalJwtAuthGuard)` together on `/chatbot/ask` and `/chatbot/history`
only. A guest's identity is a client-generated `sessionId` (UUID), persisted in `localStorage`
(`lib/chat-session.ts` — the **first** use of `localStorage` in this codebase's frontend,
deliberately narrow: just that one id, never the conversation itself) and sent as a body field or
`?sessionId=` query param; the controller 400s if a request arrives with neither a real user nor a
`sessionId`.

**Frontend**: `ChatWidget` (`components/chat-widget.tsx`) is a fixed bottom-right `IconButton`
(collapsed by default) that expands, via `Portal`, into a **non-modal** panel (`role="dialog"
aria-modal="false"`, no backdrop) — deliberately not `Drawer`/`Modal`'s pattern, since a support
widget shouldn't block reading the rest of the page while chatting. Below `sm` it becomes a
full-screen sheet; above it, a fixed `32rem × 24rem` panel bottom-right, following
`NotificationBell`'s own portal/click-outside/Escape pattern rather than `Drawer`'s. Conversation
state lives in a new `chat` Redux slice (`messages`, `open`, `unread`, `historyChecked`) — survives
client-side navigation for free, the same as `auth`/`theme` already do — and is seeded from `GET
/chatbot/history` on mount (skipped until an identity — real auth state, or a client-generated
guest session id — is actually available). The unread badge is deliberately simple: set once, only
if the initial history fetch comes back genuinely empty and the panel has never been opened this
session ("you haven't looked at this yet, and support exists"), cleared the instant the panel
opens — a page-specific trigger (idle-on-checkout, pending-order timers) was considered and
explicitly deferred as a distinct feature, not silently built. `ChatWidget` mounts once in
`AppShell`, unconditionally — confirmed `AppShell` is genuinely shared across every layout
(translated routes **and** admin/rider/design-system), so no exclusion logic was needed, unlike an
earlier draft of this plan assumed.

**Admin surface**: a new "Support" tab (`admin/support-tickets-tab.tsx`) on the existing admin
dashboard (client-side tab state, no new route) combines a filterable, resolvable support-ticket
list (mirrors `refunds-tab.tsx`/`payouts-tab.tsx` exactly) with knowledge-base management
(react-hook-form + zod create form, per-entry active toggle, edit modal, delete with confirm —
mirrors `promo-codes-tab.tsx`).

## 31. Homepage FAQ, Terms & Conditions, and Privacy Policy (docs/ROADMAP.md FDP-107)

Three pieces of user-facing content this app never had: a homepage FAQ section, and full Terms &
Conditions / Privacy Policy pages linked from the footer — all written to reflect this platform's
actual mechanics (real commission rate, real payout cadence, real payment providers, real refund
policy) rather than generic boilerplate, alongside an honest notice that this is a template
reflecting real technical behavior and should be reviewed by counsel before real-world business
use — the platform is a demo/project, not a company with legal counsel of its own.

**New `Accordion`/`AccordionItem` kit component** (`components/ui/accordion.tsx`) — the first
disclosure/collapsible primitive in this design-token-driven UI kit. Each item manages its own
open state independently (more than one can be open at once), matching common FAQ-page behavior
rather than a single-open-at-a-time accordion; native `<button>` semantics mean keyboard
activation (Enter/Space) and focus work for free, no custom key handling needed, unlike
`DropdownMenu`'s arrow-key navigation. `aria-expanded`/`aria-controls`/`role="region"` wire the
trigger to its panel per the standard disclosure pattern. New `accordion.test.tsx` covers
collapsed-by-default, expand/collapse on click, keyboard toggling, and independent (not
mutually-exclusive) open state, matching this codebase's bar for interactive-component tests.

**Homepage FAQ**: a new section in `app/[locale]/page.tsx`, placed as the last section of the page
body (`AppShell` renders `<Footer />` immediately after `{children}`, so "last section of the
page" is exactly "directly before the footer"). Twelve platform-specific Q&A pairs — not generic
SaaS boilerplate — covering: what's orderable (food/groceries/pharmacy), how delivery fees are
actually calculated (per-zone/distance, not flat), which payment providers are used and how
they're selected, live order tracking, the real refund policy, the real weekly payout cadence,
becoming a vendor or rider, payment-data safety, getting support, and multi-language support.
Rendered via the new `Accordion`, sourced from `HomePage.faq{1-12}Question`/`Answer` translation
keys (a numbered-key pattern chosen so each Q&A pair translates as two short strings, not one
large block).

**Terms & Conditions** (`app/[locale]/terms/page.tsx`) and **Privacy Policy**
(`app/[locale]/privacy/page.tsx`): same static-page shape as `careers/page.tsx` — server
component, `getTranslations()` for all copy including `generateMetadata`, content rendered from a
numbered `section{n}Title`/`section{n}Body` translation-key pattern (15 sections for Terms, 12 for
Privacy) so each is its own short pair of translatable strings rather than one giant block. An
`Alert variant="info"` at the top of each page carries the honest template/counsel-review notice
described above, translated in every language rather than only shown in English.
- **Terms** covers: acceptance and who it applies to; what the platform is (a three-party
  marketplace — technology intermediary, not the seller of vendor goods nor employer of vendors/
  riders); accounts and eligibility; how ordering/pricing/delivery fees actually work; how payments
  are processed (Stripe/Paystack/Flutterwave, server-side-verified status only, matching this
  repo's non-negotiable payment rule); the real 15% platform commission and weekly payout batch,
  disclosed as a vendor-facing term; the real refund policy (delivered/cancelled + successful
  payment, admin-reviewed); delivery estimates and scheduled-ordering behavior; vendor obligations
  (accurate listings, KYC before going live, fulfillment, food-safety/licensing compliance); rider
  obligations (KYC, safe/lawful delivery conduct, accurate availability); prohibited conduct;
  reviews/content moderation; liability limitations (marketplace-operator framing, each vendor/
  rider independently responsible for their own goods/services); suspension/termination; and
  changes to the terms.
- **Privacy** covers: what's actually collected (account info, addresses, payment *metadata* —
  never raw card numbers, which the payment providers alone handle; KYC documents; location data;
  chat messages/session id); how it's used; location-data use (delivery-fee calculation, live
  tracking, "Near me" — always browser-permission-gated, never sold); cookies/local storage (the
  existing theme preference plus this app's only other `localStorage` use, the FDP-106 guest chat
  session id — both named explicitly, since this section audits every real use in the app rather
  than a generic disclaimer); how data is shared (vendors/riders for fulfillment, payment/
  communication providers, never sold); retention; user rights (access/update/delete via
  `/account`, already-existing); children's privacy (not directed at under-16s); international
  transfer; security (never storing raw card data, server-side-verified payment status — the same
  real behavior cited in Terms, not a generic "we take security seriously" line); and changes to
  the policy.

**Footer links**: `components/footer.tsx` gained a small-print row next to the copyright line
linking `Terms` (`/terms`) and `Privacy` (`/privacy`), visible regardless of auth state.

All new copy (FAQ, both legal pages, footer labels) shipped in all 6 languages in the same change,
per the standing translation rule — 92 new keys, key-parity verified (1474 keys total).

## 32. Real-time admin<->vendor messaging (docs/ROADMAP.md FDP-108)

A genuine two-way, real-time conversation thread between an admin and a restaurant/store owner
("vendor") — for issues spanning ordering, refunds, payouts, or anything else that doesn't fit a
support ticket's one-shot Q&A shape. This is the first real conversation/thread model in this
codebase: the two earlier "chat" features (support-tickets/chatbot, FDP-106) are either a single
escalated question with no reply field, or a flat non-threaded Q&A log — neither supports a
back-and-forth exchange.

**Backend — `vendor-messages/` module**: one thread per vendor user (`VendorMessage.vendorId`),
not per admin — any admin can view and reply to any vendor's thread, mirroring how support
tickets are worked by "admin" as a role rather than one specific admin. Two schemas: `VendorMessage`
(the flat, timestamped message log itself) and `VendorConversation` (one inbox-row summary per
vendor — `lastMessageAt`/`lastMessagePreview`/`lastSenderRole`/`unreadByAdmin`/`unreadByVendor`),
upserted alongside every message write rather than aggregated on every list request — the same
"summary row updated on write" shape used elsewhere for read-heavy admin lists. The upsert's
`$inc`/`$setOnInsert` had to be split carefully: Mongo rejects an update that targets the *same*
field with both operators in one call, so only the unread counter *not* being incremented this
call gets an explicit `$setOnInsert` default — `$inc` on a fresh document already initializes its
own field to the increment amount. Two controllers share the module: `VendorMessagesController`
(`/vendor-messages`, `@Roles('restaurant_owner')`, own-thread-only — `vendorId` is always the
caller's own id) and `AdminVendorConversationsController` (`/admin/vendor-conversations`,
`@Roles('admin')`, any vendor). Vendor name resolution for the admin conversation list reuses
`PayoutExecutionService.attachVendorNames`'s exact batched-lookup pattern (new
`UsersService.findByIds`, mirroring `RestaurantsService.findByIds`) rather than a query per row.

**Real-time**: extends the existing `RealtimeGateway` (docs/ARCHITECTURE.md §9) rather than
standing up a second socket layer — new `vendor-conversation:subscribe` event joins a
`vendor-conversation:<vendorId>` room (ownership check needs no DB lookup here, unlike
`restaurant:subscribe`/`store:subscribe`: `vendorId` *is* the vendor's own user id, the
conversation's partition key, not a separate resource with its own `ownerId` field — any admin
may also join). `VendorMessagesService` calls a new `emitVendorMessage(vendorId, message)` after
every persisted message, live-updating an open thread for whichever side currently has it open —
the exact dual fan-out `OrdersService` already uses after a status transition (persist, push live
via the gateway, then also call `NotificationsService.notify()` — two new types,
`new_vendor_message`/`new_admin_message` — so the recipient sees it in their bell/email/push even
when the thread isn't open).

**Frontend**: `dashboard/messages/page.tsx` — the vendor's own thread, a full page (not a floating
widget like the customer-facing `ChatWidget`, since this is an account-level page a vendor
navigates to deliberately, not an ambient always-available helper) reachable from a new
`AuthStatus` link shown only for `restaurant_owner` (deliberately not `admin`, unlike the
`myRestaurants`/`myStores` links beside it — an admin visiting this route would see an empty
thread under their own account id, not the inbox they actually want, which is the admin-side tab
below). Joins its room via `socket.emit("vendor-conversation:subscribe", { vendorId: user.id })`
and refetches on `vendor-message:new`, mirroring `orders/[id]/page.tsx`'s own
join-then-refetch-on-event pattern. `admin/messages-tab.tsx` (10th admin dashboard tab) is a
master-detail layout — a conversation list (vendor name, preview, unread dot) plus a thread panel
for whichever conversation is selected, and a "New message" modal (vendor picked via the existing
admin `useListUsersQuery({ role: "restaurant_owner" })`, reusing the users list already built for
the admin Users tab rather than adding a new backend endpoint just for this picker) so an admin
can proactively start a conversation with a vendor who hasn't written in yet.

New `dashboard/messages/page.test.tsx` (5 tests: empty state, rendering/alignment of both
senders, sending, error-recovery, mark-read-on-mount) is the first component test in this
codebase to render anything wrapped in `RequireRole` — doing so pulls in `next-intl/navigation`'s
`createNavigation`, which internally imports `next/navigation`, a module Vite/Vitest can't
resolve outside an actual Next.js build; both `next/navigation` and `@/i18n/navigation` are
mocked in the test for this reason. No dedicated test for `admin/messages-tab.tsx`, matching this
codebase's existing convention — no admin dashboard tab has its own component test.

Live-verified end-to-end against the real running backend/database (not just unit tests): a test
vendor account sent a message, the admin conversation list correctly showed the resolved vendor
name/preview/unread count, an admin reply appeared in the vendor's own thread, and both directions
correctly fired the right notification type to the right recipient. Full backend (566 tests,
13 new) and frontend (119 tests, 5 new) suites pass; `tsc --noEmit`/`eslint`/production `build`
clean on both sides — the production `nest build` caught one thing plain `tsc --noEmit` didn't:
`isolatedModules` requires `VendorConversation`'s cross-schema `VendorMessageSenderRole` import be
an explicit `import type`. 25 new translation keys across `AuthStatus`/`AdminPage`/
`VendorMessagesPage`/`AdminMessagesTab`, shipped in all 6 languages, key-parity verified (1499
keys).

## 33. Security/correctness audit (docs/ROADMAP.md FDP-109)

Requested directly by the user alongside FDP-108 ("audit the system thoroughly to fix any
issues"). Run as 4 parallel focused agent passes — auth/authz, payments/money-safety, input
validation/injection, and Mongoose `ObjectId` data-integrity — each independently searching and
live-reproducing candidate bugs (via `mongodb-memory-server` repro scripts, not just static
reading) rather than only flagging suspicious-looking code. Nine findings survived verification
and were fixed in one branch, ordered here by severity.

1. **Payout clawback consumption lost on a confirmed-ambiguous transfer.**
   `PayoutExecutionService.executePayout()` computes `clawbackConsumption` (which
   `PayoutClawback` rows this payout run is settling, and how much of each) only as an
   in-memory value for that run — it was never persisted on the `Payout` document itself, only
   the simpler `clawbackDeducted` total was. When a transfer comes back from a provider as
   *ambiguous* (`reconciliationRequired: true` — the provider's API didn't clearly confirm
   success or failure) and an admin later calls `resolveReconciliation(payoutId, true)` to
   confirm it actually did succeed, the code had no record left of *which* clawbacks to apply —
   the normal success path's `applyClawbackConsumption` call only runs during `executePayout`
   itself, which an ambiguous outcome skips. Net effect: a vendor who was refunded once got
   silently charged for that same refund a second time out of a later week's earnings, with no
   error, log, or record anywhere that it happened twice. Fixed by adding a persisted
   `clawbackConsumption: { clawbackId, amountConsumed }[]` field to the `Payout` schema (in
   addition to `clawbackDeducted`) and replaying it via `applyClawbackConsumption` inside
   `resolveReconciliation` when the confirmed outcome is success. 2 new tests assert the
   snapshotted consumption is/isn't applied depending on the confirmed outcome.

2. **`UsersService.suspend()` revoked zero refresh tokens.** `AuthService.issueTokens` writes
   `RefreshToken.userId` as a real `ObjectId` (never stringified) — confirmed as the convention
   at all 3 other query sites in `auth.service.ts`. `suspend()` was the one outlier, querying
   `updateMany({ userId: user._id.toString(), revokedAt: null }, ...)` — per the Mongoose 9
   `ObjectId`-cast gotcha already documented in `backend/CLAUDE.md`, a string can never match a
   field genuinely stored as an `ObjectId`, so this silently matched and revoked **zero**
   sessions on every real suspension (`modifiedCount: 0`, no error, no exception). A suspended
   user's existing access tokens still expire normally, but every refresh token they held stayed
   valid indefinitely — the suspension had no effect on session control at all. Fixed by dropping
   the `.toString()`. The existing test's own fixture had been unknowingly written to match the
   buggy query (storing the token with a stringified `userId` too), which is why it passed; the
   fixture was corrected to write a real `ObjectId`, matching production behavior.

3. **Stored XSS via a vendor's own restaurant name/description.** A restaurant owner's
   self-supplied `name`/`description` (validated for length only, never content, by design —
   arbitrary business names are legitimate input) is serialized directly into a
   `<script type="application/ld+json">` block on `restaurants/[slug]/layout.tsx` via
   `dangerouslySetInnerHTML={{ __html: JSON.stringify(...) }}`. `JSON.stringify` never escapes
   `<`, so a name/description containing `</script><script>...` breaks out of the JSON-LD block
   and executes as real script on every visitor's page — a stored, unauthenticated-reach XSS from
   a self-registerable role. Fixed with a `safeJsonLd()` helper that replaces every `<` with its
   `<` JSON-string escape (valid inside a JSON string, identical once parsed, but can no
   longer prematurely close the surrounding `<script>` tag) before serializing.

4. **Approved vendor content could be silently swapped post-approval.** `findBySlug` (the only
   path a customer reaches a restaurant/store through) gates on `isApproved: true`, but
   `RestaurantsService.update()`/`StoresService.update()` never touched that flag — an owner
   could get `name`/`description`/`cuisineTypes`/`logoUrl`/`coverUrl` approved once by an admin,
   then freely swap any of that public content afterward with no further review, while staying
   visibly "approved." Fixed: both `update()` methods now reset `isApproved` to `false` whenever
   any of that fixed content-field set changes, leaving operational-only edits (opening hours,
   price level, address, `isOpen`) untouched so a vendor isn't forced through re-approval for
   routine operations. 4 new tests per service cover the reset, the non-reset case, and the
   already-pending case.

5. **Unverified riders could read every customer's exact delivery address.** `RidersService.apply`
   grants the `rider` role immediately on self-registration; verification is a separate, later
   admin step. `RidersController.queue()` (`GET /riders/queue`) had no verification gate at all,
   so a rider who had merely applied — not yet been verified — could see every unassigned order's
   full `deliveryAddress` (including `line1`/`lat`/`lng`) and `customerId`. The queue being
   visible pre-verification is a deliberate product choice (confirmed via
   `RidersService.assertVerified`'s own doc comment and the frontend already rendering a disabled
   Accept button, not a hidden queue, for unverified riders) — so the fix redacts rather than
   blocks: an unverified rider's response now reduces `deliveryAddress` to `{city, state}` and
   sets `customerId` to `undefined`, while a verified rider gets the unmodified order. New
   `riders.controller.spec.ts` (first controller-level spec in this module) covers both cases.

6. **Promo code redemption had a race condition.** `PromoCodesService.redeem()` did an
   unconditional `$inc` on `usedCount` with no atomic guard against `usageLimit` — the earlier
   `validate()` read-then-later-`redeem()`-write gap meant two concurrent orders could both pass
   validation and both redeem a code's last remaining slot, pushing `usedCount` past
   `usageLimit`. Rewritten as a single atomic `updateOne` whose filter includes an `$expr`
   comparing `usedCount` against `usageLimit` on the same document, so the increment only commits
   if a slot was still genuinely available at write time; `redeem()` now returns a boolean the
   caller can act on. A new concurrency test runs two `redeem()` calls via `Promise.all` against a
   `usageLimit: 1` code and asserts exactly one succeeds.

7. **A delivered-then-refunded order silently lost the rider's earned fee.** Per `OrdersService`'s
   own existing doc comment, a rider who genuinely completed a delivery keeps their fee
   regardless of what later happens to the customer's payment — but
   `PayoutsService.getUnpaidRiderEarnings()` filtered orders by `status: 'DELIVERED'`, and a later
   refund flips `status` to `'REFUNDED'`, permanently dropping that order out of the query with no
   record. Fixed by filtering on `deliveredAt: { $ne: null }` instead — set exactly once at the
   real delivery transition and never cleared afterward (confirmed via grep: no code path ever
   nulls it back out), so it survives a later status change and reflects what actually happened.

8. **A partial refund was silently treated as a full one.** `PaymentsService.handleRefundWebhook`
   finalized any refund event as if the order's entire total had been refunded, releasing it from
   further payout holds — but a partial refund (a real, provider-supported case) leaves part of
   the order's value still legitimately owed to the vendor/rider. None of the 3 adapters
   previously parsed the refunded amount at all. Added `amountRefunded` parsing to all 3
   (`stripe.adapter.ts`: `amount_refunded` cents; `paystack.adapter.ts`: `data.amount` kobo,
   confirmed only via third-party documentation — Paystack's own reference docs return 403 in
   this environment; `flutterwave.adapter.ts`: `data.amount_refunded`, already in standard units
   per its fetched OpenAPI schema). `handleRefundWebhook` now compares the parsed amount against
   the order's own trusted `order.total` (a single provider-agnostic comparison, rather than 3
   different "is this partial" implementations) and, when it's genuinely less (past a float-
   rounding tolerance), flags every admin for manual review instead of auto-finalizing — new
   `OrdersService.notifyAdminsOfPartialRefund`, reusing the existing admin-fan-out notification
   pattern, deliberately informational-only (no automatic status change or clawback, same posture
   as the existing dispute-flagging path). Any parse failure or missing field degrades gracefully
   back to the pre-existing full-refund behavior rather than erroring.

9. **Several inputs had no upper bound.** `chatbot`'s `sessionId` (both the `ask` DTO and, via a
   raw `@Query('sessionId')` primitive on `history()` that bypassed the global `ValidationPipe`
   entirely — moved onto a proper `GetChatHistoryDto`), `knowledge-base`'s
   `question`/`answer`/`keywords`/`category`, and `cuisineTypes`/`tags` array items on
   restaurant/store creation all previously had no `@MaxLength`/`@ArrayMaxSize` ceiling — any
   authenticated (or, for the chatbot, unauthenticated) caller could submit an arbitrarily large
   payload. All given explicit caps.

Full backend suite (566 tests, 19 new — the clawback/suspend/promo-code/refund/redaction/
approval-reset tests listed above) and frontend suite (119 tests, unchanged — the XSS and rider-
redaction fixes needed no new frontend tests, only a translation key for the redacted-address
copy) pass; `tsc --noEmit`, `eslint --fix` (diff re-scoped to just these files afterward — the
`--fix` pass also reformatted several unrelated files' line-wrapping, reverted to keep this PR's
diff to only its intended changes), and production `build` clean on both sides. One new
translation key (`RiderDashboardPage.deliverToAreaOnly`) shipped in all 6 languages, key-parity
verified.

## 34. Vendor-messaging UX fixes and an LLM-backed chatbot (docs/ROADMAP.md FDP-110)

Three issues reported directly by the user after using the live admin↔vendor messaging (FDP-108)
and support chatbot (FDP-106) features in production.

**1. `Select` opened from inside a `Modal` was invisible/unclickable.** The admin "New message"
modal's vendor picker (`admin/messages-tab.tsx`'s `NewConversationModal`) is the first place in
this codebase a `Select` is nested inside a `Modal`. Both portal to `document.body` as siblings —
`Select`'s open option list used `--z-dropdown` (1000), `Modal`'s wrapper (backdrop + panel
together) uses `--z-modal` (1300), so the modal painted over the dropdown regardless of DOM/mount
order, exactly the stacking-context gotcha `frontend/CLAUDE.md` already documents for
`DropdownMenu`-in-`Modal` (fixed there in FDP-8 by going inline instead). `Select` can't know at
authoring time whether a given instance sits inside a `Modal`, and — unlike `DropdownMenu` — is a
generic, frequently-portal-necessary form control used all over the app, so the fix is a new tier
between them rather than an inline alternative: `--z-popover: 1350` (`tokens.css`, `tokens.ts`),
which `Select`'s portal now uses unconditionally. New regression test in `select.test.tsx`
asserts the portal's z-index directly.

**2. Vendor↔admin messages needed a manual refresh to appear for the other party.** The sender
already saw their own message immediately — `sendVendorMessage`/`sendAdminVendorMessage`'s
`invalidatesTags` already triggered a refetch on success — so the actual gap was one-directional:
whichever side *didn't* send the message relied entirely on `RealtimeGateway`'s socket push
(`vendor-message:new`) to know to refetch, and that push was not reliably reaching the browser in
this app's live deployment. The gateway/service code itself (room join, ownership check,
`emitVendorMessage` call) was verified correct by re-reading it end to end; the socket
infrastructure could not be directly diagnosed from this environment (Vercel env vars pull as
redacted, no Railway CLI access here) to confirm the exact root cause. Rather than ship an
unverifiable guess, both message queries (`useGetVendorMessagesQuery` on the vendor's own thread,
`useGetVendorConversationMessagesQuery` on the admin's open thread, `useListVendorConversationsQuery`
on the admin's conversation list) now also poll (4s for an open thread, 8s for the list) —
socket push still delivers instantly when the connection is healthy, polling is a guaranteed
eventually-consistent fallback when it isn't, so the feature can no longer depend entirely on
infrastructure this session couldn't verify. `lib/socket.ts` also now logs `connect_error` to the
browser console, so a future recurrence has an actual diagnostic trail instead of silent failure.

**3. The chatbot's keyword-only matching read as unintelligent.** A plain "hi" scored zero against
every knowledge-base entry's keywords (docs/ROADMAP.md FDP-106's deterministic matcher has no
concept of small talk) and fell through to the canned human-escalation message — technically
correct per the original design, but a poor first impression for something styled as a chat
widget. New `LlmChatService` (`backend/src/chatbot/llm-chat.service.ts`) calls Anthropic's
Messages API (Claude Haiku by default) with the *entire active knowledge base* as grounding
context and a system prompt that explicitly keeps it scoped: answer platform questions using only
the supplied knowledge base as source of truth, handle greetings/small talk warmly, and — the
one property this ticket was careful to preserve from FDP-106's original design intent — honestly
signal low confidence (rather than guess) for anything unrelated or under-informed, still
triggering the exact same human-escalation support-ticket fallback as before. Confidence is
returned as a real structured field, not parsed from free text: the call forces Anthropic's
tool-use feature (`tool_choice: { type: 'tool', name: 'submit_answer' }`) so the response is a
parsed `{ answer, confident }` object, not a hope that the model's prose happens to be valid JSON.
`ChatbotService.ask()` is now a three-tier fallback chain — LLM (when `ANTHROPIC_API_KEY` is
configured) → deterministic keyword matcher → the original canned fallback message — so an
unconfigured key, a failed API call, or an unexpected response shape all degrade gracefully to
the pre-existing FDP-106 behavior rather than breaking the widget outright, exactly mirroring
`SmsService`'s established `isConfigured`/graceful-degradation pattern for an optional
third-party integration (`backend/CLAUDE.md`). Implemented as a plain `fetch` call against
Anthropic's REST API rather than adding the `@anthropic-ai/sdk` dependency, same reasoning as
`SmsService`'s Termii integration — one endpoint doesn't need a full SDK. `ANTHROPIC_API_KEY`/
`ANTHROPIC_MODEL` are both optional env vars (`.env.example`, `env.validation.ts`); no real key
was available in this session, so the LLM path is implemented and unit-tested (mocking `fetch`,
never calling the real API) but not live-verified against Anthropic end to end — that's the one
piece of this ticket the user still needs to do: add a real `ANTHROPIC_API_KEY` to
`backend/.env` locally and to Railway's production env vars.

Full backend suite passes (33 tests across the touched `chatbot`/`knowledge-base` specs, several
new — `llm-chat.service.spec.ts` mocks `fetch` exactly like `sms.service.spec.ts` does for
Termii); `tsc --noEmit` clean on both sides. No new translation keys — none of the three fixes
change user-visible copy.

## 35. Vendor promo codes and restaurant menu-item discounts (docs/ROADMAP.md FDP-111)

The user asked to test promo codes and product discounts end to end and hit two gaps against
what they expected from the request: promo codes could only be created by an admin, and the
discounted-price/strikethrough feature — real and functional (it changes what's actually
charged, not just displayed, see `CartService.addStoreItem`) — only existed for store products,
never restaurant menu items. Both closed in this ticket.

**Vendor-created promo codes.** `PromoCodesController.create`/`update` now also accept
`@Roles('admin', 'restaurant_owner')`, with the actual ownership enforcement living in
`PromoCodesService` (mirrors this codebase's established "`@Roles()` only checks the role label,
ownership is a separate service-layer check" convention, `backend/CLAUDE.md`): a
`restaurant_owner` may only create a code scoped to a restaurant or store they actually own —
never platform-wide (an admin-only capability, since nothing would scope it to any particular
vendor) and never for someone else's business — checked via a new `assertSellerOwnership` helper
that reuses `RestaurantsService`/`StoresService`'s existing `assertOwnerOrAdmin`. A vendor may
also update (e.g. deactivate) their own code, but can never reassign its `restaurantId`/`storeId`
— changing which business a code belongs to stays admin-only. New `GET /promo-codes/mine`
(`PromoCodesService.findMine`) gathers every restaurant and store a vendor owns
(`RestaurantsService.findMine`/`StoresService.findMine`) and returns codes scoped to any of them,
across both seller types — distinct from admin's `GET /promo-codes`, which lists everything
platform-wide.

`PromoCodesModule` now imports `RestaurantsModule`/`StoresModule` to reach their services (no
circularity — neither imports back). Frontend: two new per-entity dashboard pages,
`dashboard/restaurants/[id]/promo-codes` and `dashboard/stores/[id]/promo-codes`, linked from
each entity's own management page (`DashboardRestaurantsPage`/`DashboardStoresPage`) right next
to the existing delivery-zones/earnings links — the same per-entity-subpage shape those already
use. Because the restaurant/store id comes from the URL, the create form needs no seller picker
at all (unlike the admin tab, which manages every vendor's codes and has none to infer from) —
it's the exact same `CreatePromoForm`/`PromoRow` UI as `AdminPromoCodesTab`, just with
`restaurantId`/`storeId` baked in from `params` and the list filtered client-side from
`useListMyPromoCodesQuery()` (a vendor's total code count across all their businesses is small
enough that filtering the one `GET /promo-codes/mine` response client-side per page beats a
second scoped-list endpoint).

**Restaurant menu-item discounts.** `MenuItem` gained a `discountedPrice: number | null` field,
byte-for-byte the same shape and doc comment as `Product.discountedPrice` (stores,
docs/ROADMAP.md FDP-56). `MenuService.createItem`/`updateItem` gained the identical
`assertDiscountBelowPrice` server-side guard `ProductsService` already had (discount must be
strictly lower than price — a defense-in-depth check, since the frontend zod schema already
enforces this too, exactly mirroring `CatalogManagerPage`'s own `.refine`). Confirmed first,
before mirroring anything, that a store product's `discountedPrice` isn't just a cosmetic label —
`CartService.addStoreItem` snapshots `product.discountedPrice ?? product.price` as the actual
line-item charge at add-to-cart time — so `CartService.addItem` and the `reorderFromOrder` restore
path both got the equivalent `menuItem.discountedPrice ?? menuItem.price` treatment, making the
discount genuinely change what a customer pays for a discounted dish, not just how it's displayed.
`MenuManagerPage`'s item form (vendor-facing) and `restaurants/[slug]/page.tsx` (customer-facing)
both get the identical strikethrough-original/highlighted-discounted rendering
`CatalogManagerPage`/`stores/[slug]/page.tsx` already use for store products — same muted
line-through original price, same accent-colored discounted price beside it.

Full backend suite passes (165 tests across the touched `promo-codes`/`menu`/`cart`/`orders`
specs, several new: vendor create/update ownership enforcement and rejection paths, `findMine`
scoping across both seller types, menu-item discount validation on create and update, cart
charged-price preference for a discounted menu item) — `promo-codes.service.spec.ts` and
`orders.service.spec.ts` both needed every existing `PromoCodesService.create`/`.update()` call
site updated with a requester argument, since that's no longer optional; `tsc --noEmit`/`eslint`/
production `build` clean on both sides. A new `VendorPromoCodesPage` translation section (28 keys,
mostly reusing `AdminPromoCodesTab`'s exact copy verbatim — the form and row UI is identical
regardless of who's creating the code) plus a `promoCodes` nav-button label on both dashboard list
pages and 3 `MenuManagerPage.discountedPrice*` keys, shipped in all 6 languages, key-parity
verified (1533 keys).

## 36. Promo-code admin scoping, customer discovery, and a payout-account 500 (docs/ROADMAP.md FDP-112)

Follow-on feedback from actually using FDP-111 live, plus one unrelated production bug the user
hit mid-session while testing riders.

**Admin promo-code scoping.** FDP-111 let a vendor create a scoped code, but the *admin* form
still had no way to scope one — no restaurant/store picker at all, so any code an admin created
was platform-wide regardless of intent, and would never show up filtered on a vendor's own
per-entity promo-codes page. `AdminPromoCodesTab`'s `CreatePromoForm` gained an "Applies to"
selector (platform-wide / restaurant / store); picking the latter two lazily fetches
(`skip` until chosen) a searchable `Select` from the existing public `useListRestaurantsQuery`/
`useListStoresQuery` endpoints, same "reuse what already exists rather than add a new
admin-only listing endpoint" call as FDP-108's vendor picker. Separately, `PromoCodesService
.findAll()` previously returned bare documents with a raw `restaurantId`/`storeId` and no way to
tell which business a code belonged to at a glance — it now returns a `PromoCodeAdminView[]`
(plain projection, `VendorConversationView`'s established shape) with a resolved `scope`
discriminated union (`{type:'platform'}` / `{type:'restaurant'|'store', id, name}`), built from
one batched `RestaurantsService.findByIds`/new `StoresService.findByIds` lookup rather than a
query per row — shown as a badge on each admin row.

**Customer discovery.** A promo code was otherwise 100% invisible in-app — a customer had to
already know a code existed (shared externally) to ever type one in at checkout. New public
`GET /promo-codes/active?restaurantId=X` (or `?storeId=Y`), backed by
`PromoCodesService.findActiveForSeller`, returns every code currently usable for that specific
business: platform-wide codes plus ones scoped to it, filtered by the *same* eligibility rules
`validate()` already checks (`isActive`, not expired, under its usage limit via the same
`$expr` comparison `redeem()` uses) — deliberately excludes `minOrderAmount`, since there's no
cart subtotal yet at browse time, so nothing advertised here could then fail a stricter check at
checkout. Rendered by a new `PromoBanner` component ("Use code X for Y% off") mounted on both
public `restaurants/[slug]/page.tsx` and `stores/[slug]/page.tsx`, right where the "currently
closed" alert already sits — renders nothing while loading or when there's nothing active, since
this is a bonus a visitor is never left waiting on.

**A real discount-display bug, and a deliberately-scoped-out relabel.** While reviewing this,
found `ItemDetailModal`'s Add-to-cart button computing its total from `item.price` unconditionally
— a customer opening a discounted item's modifier/quantity modal was quoted (and would have been
charged) the pre-discount price, the one place in the app the discount wasn't actually honored
end to end. Fixed to `item.discountedPrice ?? item.price`, plus a small strikethrough-price line
added to the modal body itself so the discount is visible before scrolling to the total. Separately,
the user pointed out `discountedPrice`'s *name* was confusing — they expected it to mean "amount
taken off" (so a ₦100 discount on a ₦4000 item), not what it's always meant since FDP-56, "the
final price customers pay" (so ₦3900 directly). Deliberately did **not** change the underlying
meaning — `discountedPrice` already has real vendor/test data live in the database under the
"final price" semantic (e.g. an item priced at 4200 with `discountedPrice: 4100` genuinely means
"sells for ₦4,100"); reinterpreting the same stored numbers as "amount off" with no migration
would have silently collapsed that item's real price to ₦100. Instead relabeled the vendor-facing
field to "Sale price" in both `MenuManagerPage`/`CatalogManagerPage`, and added a live-computed
"You save {amount}" hint (`useWatch` on the price and sale-price fields, shown once sale price is
a valid number below price) so a vendor never has to do the subtraction themselves to know what
they're actually discounting by.

**Unrelated: a rider's payout-account connection threw a raw 500.** Root cause, confirmed via a
live `mongodb-memory-server` repro script before writing any fix: `RidersService`/
`RestaurantsService`/`StoresService`'s `applyPayoutAccountUpdate` all used load-mutate-`.save()`
— and Mongoose's `.save()` revalidates the *entire* document against every field the schema
requires, not just the ones actually touched. A rider whose document had any unrelated data issue
(this session couldn't determine what, exactly, for the specific reported account — no production
DB access) got an opaque `AllExceptionsFilter`-caught 500 from an update that only ever touches
`payoutAccounts`. Rewritten in all three services as two sequential atomic `findOneAndUpdate`
calls — MongoDB rejects `$set`/`$push` targeting overlapping array paths in one update (the same
"path conflict" class `VendorMessagesService` already hit for `$inc`/`$setOnInsert`), so "does an
entry for this provider already exist" needs two round trips, acceptable for this low-frequency,
self-service, non-concurrent write. Also added a `savePayoutAccount` error-wrapping helper
(mirroring each controller's existing `callPaystack`/`callFlutterwave`/`callStripe` pattern) around
the `setPayoutAccount`/`setPayoutAccountFromWebhook` call in all three payout controllers, so any
*future* persistence failure there — Paystack/Flutterwave/Stripe alike — surfaces as a clear
message instead of a raw 500, closing the actual "must never surface as an opaque 500" gap those
controllers' own doc comments already claimed to have closed but hadn't, for this one call site.

Caught a genuine MongoDB query-semantics trap live while building this, confirmed with an
isolated repro script both ways: the obvious `'payoutAccounts.provider': { $ne: provider }`
filter for "no existing entry for this provider" does *not* reliably match a rider whose
`payoutAccounts` array is empty — the normal case for anyone connecting their first payout
account ever — silently throwing the exact `NotFoundException` this whole rewrite exists to
avoid. Fixed with the unambiguous idiom instead: `payoutAccounts: { $not: { $elemMatch:
{ provider } } }`. A first attempt at a regression test for the rider fix also hit the
documented Mongoose `@Prop()`-Mixed-type ObjectId/string quirk (`backend/CLAUDE.md`) the wrong
way: the test fixture wrote `userId: customer._id` (a raw `ObjectId`) instead of
`customer._id.toString()`, which — because `RidersService.apply()` always assigns
`requester.sub` (a string) in real usage — silently stored `userId` as a genuine `ObjectId`
instead of a string, causing the new string-based query to match nothing. The exact fixture
mistake `backend/CLAUDE.md` already documents from FDP-92's `payout-execution.service.spec.ts`;
fixed the same way, by stringifying the id in the fixture.

Full backend suite passes (264 tests across `promo-codes`/`menu`/`cart`/`orders`/`riders`/
`restaurants`/`stores`, including new coverage for admin scope enrichment, `findActiveForSeller`'s
eligibility filtering, and a rider payout update succeeding against a deliberately incomplete
document); `tsc --noEmit`/`eslint`/production `build` clean on both sides. New `PromoBanner`
translation section, `AdminPromoCodesTab` scope-picker keys, and a `youSave` key in
`MenuManagerPage`/`CatalogManagerPage`, shipped in all 6 languages, key-parity verified.

## 37. A legacy promo code's `undefined` field crashed the admin Promo Codes tab (docs/ROADMAP.md FDP-114)

The user reported the admin Promo Codes tab throwing a hard, page-crashing error in production:
`Cannot read properties of undefined (reading 'type')`. Root cause: `PromoCodesService.findAll()`
(FDP-112's admin scope enrichment) and `validate()` both decided whether a code was
restaurant/store-scoped with `promo.restaurantId !== null` / `promo.storeId !== null` — a
**strict** inequality. A promo code whose document predates these fields (or was written by any
path that bypassed the schema's `default: null`, e.g. a raw insert) reads back with the field
genuinely `undefined`, not `null`. In JavaScript `undefined !== null` evaluates to `true`, so the
strict check wrongly treated that legacy code as scoped, then crashed calling `.toString()` on
`undefined` inside `findAll()`'s per-row `.map()` — which failed the *entire* `GET /promo-codes`
request (not just that one row), and the frontend then crashed a second time trying to read
`.scope.type` off a response that never actually arrived. The identical strict check in
`validate()` meant the same legacy code would have crashed a real customer's checkout the moment
they tried to redeem it — not yet hit live, since redeeming an old code is rarer than an admin
just opening the tab, but a genuine landmine sitting in the exact same code shape.

Fixed both to `!= null` (loose) — the correct JS idiom for "is this field genuinely absent",
since loose inequality against `null` treats `null` and `undefined` as equivalent while still
distinguishing them from any real value. Two new regression tests insert a `PromoCode` document
via the raw MongoDB driver (`promoCodeModel.collection.insertOne(...)`, deliberately bypassing
Mongoose's own document construction and its `default: null` entirely, the only way to reliably
reproduce a field that's truly `undefined` rather than `null`) with `restaurantId`/`storeId`
omitted, confirming `findAll()` reports `scope: {type: 'platform'}` and `validate()` returns
`valid: true` for a restaurant cart, instead of either throwing. Also added a defensive fallback
in `AdminPromoCodesTab`'s row rendering (`!promo.scope || promo.scope.type === "platform" ? ...`)
so a future backend data-shape surprise this specific fix didn't anticipate still degrades to a
"platform-wide" badge rather than crashing the whole tab again — the same "never let one bad row
take down the page" posture already applied throughout this codebase's list views.

Full `promo-codes` suite passes (43 tests, 2 new); `tsc --noEmit`/`eslint`/production `build`
clean on both sides. No translation changes.

## 38. Automated business verification: Youverify CAC/RC check for restaurants and stores (docs/ROADMAP.md FDP-115)

The user asked for a second, automated layer of vendor verification alongside the existing manual
admin review (FDP-60): a restaurant/store owner enters their business registration number
(Nigeria's CAC — RC/BN/IT/LP/LLP prefix, or another country's equivalent) at signup, an automated
check runs against a third-party API, and — if it confirms the business — the restaurant/store can
go live without waiting on a human, once it also has at least one menu item/product. If the check
fails or can't run, it falls back to exactly today's manual admin queue; admin can still approve
manually regardless of what the automated check found.

**Provider**: Youverify (chosen for having a direct CAC/RC lookup endpoint). No real Youverify
account exists for this project — `BusinessVerificationService`
(`backend/src/business-verification/business-verification.service.ts`) is built as an optional,
graceful-degradation integration from day one, the same posture as `SmsService`/Termii: reads
`YOUVERIFY_API_KEY` via `ConfigService.get` (not `getOrThrow`), and when unset every call resolves
to `{ outcome: 'unknown', reason: 'Youverify not configured' }` without ever touching the network.
The request/response shape (`YouverifyCacRequest`/`YouverifyCacResponse`, the `company-advance-check`
endpoint, a `token` auth header) is a best-effort reconstruction from Youverify's public docs, **not
verified against a live account** — flagged in the file's own doc comment for confirmation against
Youverify's real dashboard docs before this goes live with a real key, the same caveat this codebase
already carries for Paystack's refund-webhook payload shape.

**The three-way outcome, and why "unknown" is not "mismatch"**: `verifyBusinessRegistration()`
returns a discriminated union — `verified` (the number resolves and the registered name loosely
matches what the owner entered — a case/punctuation-insensitive substring check, not a real fuzzy-
match library), `mismatch` (Youverify responded but the number wasn't found or the name didn't
match — a confirmed negative *result*, never a thrown error), or `unknown` (not configured, a
network/timeout error, or an unparseable response). This mirrors the payments adapters'
"confirmed-fail vs unknown-outcome" distinction (§28) applied to a new domain: a network blip must
never be treated as "this business failed verification" — both `mismatch` and `unknown` fall back
to the exact same manual-admin-queue behavior this app already had, so an unconfigured API key or a
Youverify outage is indistinguishable from today's default, never a new way to wrongly reject a
legitimate vendor.

**Data model**: a new shared sub-schema, `BusinessVerificationResult`
(`backend/src/common/schemas/business-verification-result.schema.ts`, `{ status:
'not_attempted'|'verified'|'mismatch', providerRegisteredName, providerRegisteredAddress,
providerRawStatus, checkedAt, failureReason }`), embedded on both `Restaurant` and `Store` as
`businessVerification`, alongside a new plain `businessRegistrationNumber: string | null` field
(required by `CreateRestaurantDto`/`CreateStoreDto` for new registrations, nullable at the schema
level only for the same legacy-record reason `complianceDocumentUrl` already is — existing vendors
are never retroactively required to backfill it). `providerRegisteredAddress` is stored and shown
to admin purely as a reference — per an explicit product decision, address matching never hard-
fails automated verification, since free-text address comparison (abbreviations, formatting) is
unreliable enough to wrongly reject a legitimate business. `not_attempted` deliberately covers both
"never configured" and "the lookup threw" as the *same* stored status — both must behave identically
for gating, and `failureReason` still lets ops distinguish them in the raw document if needed.
Critically, **`businessVerification` never replaces `isApproved`** — every existing marketplace-
visibility query (`findAllApproved`, `findNearby`, `findBySlug`, `findPendingApproval`) still filters
on `isApproved` alone, unchanged; `businessVerification.status` is informational/advisory data that
only two new write paths (below) ever read before deciding whether to auto-flip `isApproved`.

**Where the check runs, and why not async/webhook**: `RestaurantsService.create()`/
`StoresService.create()` call a new private `runVerification()` synchronously, right after the
document is created — deliberately different from the payout/payment domain's webhook-primary,
poll-fallback pattern (§19/§28): Youverify's CAC lookup is a synchronous request/response (submit a
number, get an immediate result), not a genuinely asynchronous provider-side process, so there's no
webhook to wait for and no need for the `@nestjs/schedule` cron/reconciliation pattern
`payout-scheduler.service.ts` uses elsewhere. `runVerification()` is wrapped so it can **never** fail
registration itself — a Youverify outage degrades to `not_attempted`, identical to an unconfigured
key, never a 500 on signup.

**The auto-approval trigger, and a real design bug caught by the test suite**: a `verified` result
at creation time can't immediately flip `isApproved` — a brand-new restaurant/store has zero menu
items yet, so the *other* existing approval prerequisite (≥1 menu item/product, enforced today by
`AdminService.approveRestaurant`/`approveStore` for the exact module-cycle reason documented in
§FDP-60) can never be satisfied at that moment. A new `RestaurantsService.autoApproveIfEligible(id)`
(and the `StoresService` mirror) is called from `MenuService.createItem()`/
`ProductsService.createProduct()` right after an item/product is actually created — by construction,
a just-created item already proves the "≥1 item" prerequisite without an extra count query, and
`autoApproveIfEligible` reuses `approve()` verbatim (still re-checks `complianceDocumentUrl`), so
there is still exactly one method that ever flips `isApproved` true.

The first implementation also called `autoApproveIfEligible` from the new `reverifyBusiness()`
endpoint (below) — a real bug caught by this ticket's own test suite: `autoApproveIfEligible` itself
has no way to check the menu-item/product-count prerequisite (same module-cycle constraint that
keeps that check out of `RestaurantsService.approve()` entirely), so calling it from `reverifyBusiness`
could auto-list a restaurant with **zero menu items** the moment its registration number was
corrected and verified — silently bypassing a real business rule. Fixed by removing that call:
`reverifyBusiness()` only re-runs the Youverify check and saves the result; going live still
requires either the vendor's first menu item (which re-triggers the check on its own) or a manual
admin approval. This is flagged here specifically because the bug was invisible by inspection — it
only surfaced once a test asserted `isApproved` stayed `false` after a bare re-verify call on a
restaurant with no items.

**Endpoints**: `PATCH /restaurants/:id/reverify-business` and `PATCH /stores/:id/reverify-business`
(owner-or-admin, `ReverifyBusinessRegistrationDto` shared from `common/dto/` since both are
byte-identical) let an owner correct a mistyped registration number and re-run the check without
touching anything else about the listing — the fallback if Youverify mismatched or wasn't
configured at creation time. `AdminService.approveRestaurant()`/`approveStore()` and
`RestaurantsService.approve()`/`StoresService.approve()` are **unchanged** — an admin can approve a
`mismatch` or `not_attempted` business exactly as before; nothing about Youverify's opinion ever
blocks the manual override, per an explicit product requirement.

**Notifications**: three new `NOTIFICATION_TYPES` (`business_verification_passed`,
`business_verification_needs_review`, `business_auto_listed`) close a notification gap that existed
even before this ticket — `RestaurantsService.approve()`/`AdminService.approveRestaurant()` never
notified a vendor of anything. A vendor now learns immediately whether their registration was
auto-verified (with a note that a menu item/product is still needed to go live) or needs manual
review, and gets a separate notification the moment `autoApproveIfEligible` actually flips
`isApproved` — the point their listing genuinely becomes visible to customers. All three calls are
wrapped in try/catch, same "a notification failure never fails the caller" posture as every other
side-channel notification in this codebase.

**Frontend**: a new required `businessRegistrationNumber` field on both vendor registration forms
(no format regex — deliberately generic, since the platform already supports many countries beyond
Nigeria and Youverify's own graceful `mismatch`/`unknown` fallback handles a non-Nigerian number
without needing client-side format validation to gate it); the post-creation toast now branches on
`businessVerification.status === "verified"` to tell an owner they're auto-verified and just need a
menu item, instead of the old static "pending admin approval" copy regardless of outcome; and a new
card on both admin review pages shows the automated result (status badge, registered name/address,
checked-at timestamp, failure reason) next to the existing single Approve button, which is
unchanged — informational only, never gating what admin can click.

All 6 languages shipped in the same change (key parity verified across
`frontend/messages/*.json`). Full backend suite green (new `business-verification.service.spec.ts`
plus extended `restaurants`/`stores`/`menu`/`products` service specs, and every other spec file that
constructs a real `RestaurantsService`/`StoresService` updated with no-op mocks for the two new
constructor dependencies); `tsc --noEmit`/`eslint`/production `build` clean on both sides.

**A real circular-dependency bug, caught only by running every spec file together**: adding
`NotificationsService` to `RestaurantsService` closed a genuine 3-module cycle that had never
existed before — `RestaurantsModule` → `NotificationsModule` (new) → `UsersModule` (pre-existing,
for email/SMS lookups) → `RestaurantsModule` (pre-existing: `UsersService` already reads
`RestaurantsService.findByIds`/`findByIdOrThrow`). Every individual spec file that mocks
`RestaurantsService`/`StoresService` away (`admin`, `payments`) never touched this; even
`restaurants.service.spec.ts`/`stores.service.spec.ts` themselves didn't, since they never
construct `UsersService` in the same module. It only surfaced in `reviews.service.spec.ts`, whose
testing module constructs `ReviewsService`, `RestaurantsService`, and `UsersService` together in
one flat `providers` array — there, `UsersService`'s constructor reported its `RestaurantsService`
parameter as literally `undefined` ("Nest can't resolve dependencies of the UsersService (UserModel,
RefreshTokenModel, ?)"). Root cause: TypeScript's `emitDecoratorMetadata` embeds a direct reference
to each constructor parameter's class in the compiled JS, evaluated synchronously when the class
declaration runs — mid-circular-`require()`, `RestaurantsService`'s module hadn't finished
evaluating yet, so the reference was genuinely `undefined` at that instant, independent of which
spec file happened to import things in what order. Fixed with NestJS's standard tool for exactly
this: `@Inject(forwardRef(() => RestaurantsService))` on `UsersService`'s constructor parameter,
`forwardRef(() => RestaurantsModule)` on `UsersModule`'s import (`backend/src/users/users.service.ts`,
`users.module.ts`), plus the matching `@Inject(forwardRef(() => NotificationsService))` /
`forwardRef(() => NotificationsModule)` pair on the new edge in `restaurants.service.ts`/
`restaurants.module.ts`. First attempt only added the second pair and left `reviews.service.spec.ts`
still failing — the actual break in the cycle is `UsersService`'s pre-existing edge, not the new
one, a reminder that a 3+ node cycle needs the forwardRef pair on whichever edge closes the loop for
a given module's require order, not necessarily the edge that was just added.

**This still wasn't the whole fix — the third edge broke live production, not any test.** All of
this session's unit tests (including the fix above) passed, `tsc --noEmit`/`nest build` were both
clean, and it was merged, pushed, and redeployed — only for the live Railway backend to crash on
every single boot attempt with `UndefinedModuleException: The module at index [1] of the
NotificationsModule "imports" array is undefined` (`Scope [AppModule -> UsersModule ->
RestaurantsModule]`), confirmed by the user pasting the actual Railway deploy log. Root cause:
`NotificationsModule`'s own pre-existing `imports: [..., UsersModule, ...]` — the third edge of
the same cycle — had no `forwardRef` at all, because nothing about adding it had been touched.
**No unit test in this repo could have caught this**: every spec file constructs its own flat,
partial `TestingModule` with a hand-picked provider list (real or mocked), never the actual
compiled module graph `NestFactory.create(AppModule)` walks in production — so a require-order-
dependent break in a module nobody's test happens to also construct in the same file is invisible
to the entire suite, `reviews.service.spec.ts` included. Fixed by wrapping this third edge the same
way — `forwardRef(() => UsersModule)` in `NotificationsModule`'s imports,
`@Inject(forwardRef(() => UsersService))` on `NotificationsService`'s constructor parameter — and,
critically, **verified this time with an actual full-`AppModule` boot**, not just `tsc`/unit tests:
a throwaway script (`NestFactory.createApplicationContext(AppModule)` against a
`mongodb-memory-server` instance, deleted after use) that would have caught this exact class of bug
before it ever reached Railway. All three edges of the cycle now carry the forwardRef pair (module
import + constructor injection) — establishing that a 3+ node cross-module cycle needs every edge
defensively wrapped, not just whichever one a given test's require order happens to expose.

No existing `forwardRef` precedent existed anywhere else in this codebase (every prior cross-domain
dependency was avoided architecturally, e.g. `AdminService` composing `RestaurantsService`+`MenuService`
instead of either module importing the other) — this is the first case where the cycle runs through
shared infrastructure modules (`Users`/`Notifications`) that a business-domain service legitimately
needs, where restructuring away the cycle isn't a reasonable option.

**Two more pre-existing, unrelated build breaks fixed in the same branch** — both silently broken
on `main` already (confirmed via a clean-`main` diff before touching either), caught only by a real
`nest build`, not `tsc --noEmit` alone, continuing this session's running theme that the latter
cannot be trusted as a production-build proxy in this repo: `riders.service.ts` still imported
`FilterQuery` from `mongoose`, a type Mongoose 9's currently-installed patch no longer exports
(renamed to `QueryFilter`, matching what `restaurants.service.ts`/`stores.service.ts` already use) —
fixed by renaming the import and its one usage. `promo-codes.service.ts`'s `findAll()` had a
`{ ...promo.toObject(), scope } as PromoCodeAdminView` cast that a Mongoose typings update made no
longer structurally valid (TypeScript could no longer see `createdAt`/`updatedAt` on `toObject()`'s
inferred return type) — fixed by casting through `unknown` first, per TypeScript's own suggested
fix for this exact error, with no behavior change (the fields are genuinely present at runtime).

## 39. Two promo-code marketplace-visibility bugs: platform-wide codes invisible to customers, admin scope picker always empty (docs/ROADMAP.md FDP-116)

Two more live bugs the user hit, both about promo codes never actually reaching the people meant
to use them.

**Platform-wide codes had nowhere to show.** `PromoBanner` (FDP-112) only ever rendered on an
individual restaurant/store's own public page, requiring a `restaurantId` or `storeId` — a
platform-wide code an admin created (no business attached at all) was technically returned by
`findActiveForSeller` whenever a customer *did* happen to be looking at some specific business, but
never surfaced anywhere a customer browsing the marketplace itself (homepage, the all-restaurants
listing, the groceries/pharmacy category pages) would ever see it — exactly the user's report.
Fixed with a new `PromoCodesService.findActivePlatformWide()` (same active/not-expired/under-limit
eligibility rules as `findActiveForSeller`, filtered to `restaurantId: null AND storeId: null`) and
a `GET /promo-codes/active` branch: with neither `restaurantId` nor `storeId` in the query (previously
a `400`), it now returns platform-wide codes only. `PromoBanner` itself gained a seller-less mode
(`restaurantId`/`storeId` both omitted) and an optional `currency` prop — deliberately optional,
since a marketplace-wide banner has no single business's currency to format a `fixed`-type amount
in on a genuinely multi-currency platform (each restaurant/store sets its own `currency`); a
`fixed`-type code without a `currency` in scope renders generic "a special discount" wording instead
of a wrongly-denominated number, while a `percentage`-type code is unaffected (no currency needed).
Mounted on the homepage (above the hero, as a site-wide announcement), `/restaurants`, and
`/categories`.

**The admin promo-code scope picker was always empty.** Screenshot-reported: choosing "Applies to:
Restaurant" (or Store) in the admin create-promo-code form showed a searchable picker with "No
matches" no matter what was typed. Root cause: the picker called the *public*, approval-filtered
`GET /restaurants` (`RestaurantsService.findAllApproved`) / `GET /stores` — so a promo code could
only ever be scoped to an already-*approved* restaurant/store, and in this case there simply
weren't any yet (the platform's test restaurants were still pending). This is a real, separate class
of bug from the marketplace-visibility one above: an **admin-only tool silently inheriting a
customer-facing approval filter it has no business having** — an admin managing promo codes needs
to be able to target any restaurant/store, approved or not. Fixed with a genuinely new admin-only
endpoint on each domain, `GET /restaurants/admin` / `GET /stores/admin`
(`RestaurantsService.findAllForAdmin`/`StoresService.findAllForAdmin` — no approval filter, sorted
by name), declared before `:slug` for the same route-ordering reason `mine`/`pending`/`admin/:id`
already are. This also let the store picker drop its FDP-113 workaround entirely (fetching groceries
and pharmacy types separately and merging, since the public `listStores` requires a `type` filter) —
the new admin endpoint needs no type filter at all, one query instead of two.

New regression tests: `findActivePlatformWide` (includes an active platform-wide code, excludes
restaurant-scoped/store-scoped/inactive/expired/usage-limit-reached ones). Full backend suite green;
`tsc --noEmit`/`eslint`/production `build` clean on both sides. New `amountOffGeneric` key in
`PromoBanner`, shipped in all 6 languages, key parity verified.

## 40. Redesigned the marketplace-wide promo banner into a floating ticker (docs/ROADMAP.md FDP-118)

Direct, specific design feedback on §39's marketplace-wide promo banner, screenshot-annotated
"so ugly": a plain full-width `Alert` box sitting in normal document flow, pushing the homepage
hero (and everything else) down by its own height. The ask was explicit — float above the page
without displacing anything, hug the width of its own content rather than stretch full-width,
auto-advance through multiple codes like a news ticker/carousel with **no** manual forward/back
controls, and explain each offer properly instead of a bare "10% off" fragment.

**New component**: `PromoTicker` (`frontend/src/components/promo-ticker.tsx`) replaces the
marketplace-wide usage of `PromoBanner` on the homepage, `/restaurants`, and `/categories`.
`PromoBanner` itself (the original FDP-112 component, shown on one restaurant/store's own page,
scoped and currency-aware) is untouched — this redesign only applies to the seller-less,
marketplace-wide case, which is visually and contextually a different thing entirely.

- **Floating, not flowing**: `position: fixed`, taken fully out of document flow — mounting it
  anywhere in a page's JSX adds zero height to that page, on any of the three pages that use it.
  Positioned just under the sticky header (`--z-sticky`, 1100) at the next tier down
  (`--z-dropdown`, 1000), horizontally centered via an `inset-x-0 flex justify-center` outer
  strip. The outer strip is `pointer-events-none` so it never blocks clicks on whatever's
  underneath its near-empty band; the pill itself opts back into `pointer-events-auto`. Top
  offset is responsive (`top-32` / `128px` below `sm`, `top-18` / `72px` at `sm` and up) because
  `HeaderSearchSlot` wraps the header's search box onto its own full-width row below `sm` on
  every page (confirmed by reading its own routing-aware logic before picking these numbers) —
  a single fixed offset would have overlapped the taller mobile header.
- **Width hugs content, not viewport**: no fixed or full-width class anywhere on the pill — it's
  a plain flex row that sizes to its own content, capped at `max-w-[calc(100vw-2rem)]` purely as
  a mobile safety net for an unusually long headline, not a target width.
- **Auto-rotation, no controls**: when more than one code is active, a `setInterval`/`setTimeout`
  pair (4.5s dwell, 250ms crossfade) advances through them — opacity + a small vertical
  translate, no arrows or dots anywhere, matching the explicit "don't put forward/backward
  arrows" instruction. A single active code just sits still (the effect no-ops when `count <= 1`).
  Verified live in a real browser that the timer/crossfade genuinely works, not just that the
  code compiles — dev-mode overhead (HMR, an unrelated local-backend `ECONNREFUSED` polling
  failure) made the observed rotation slower than the configured 4.5s in one throwaway test, which
  was itself confirmed to be dev-environment noise, not a bug, before moving on.
- **Copy, not just layout**: full sentences instead of fragments — "Save {value}% on your next
  order" for a percentage code, plus a highlighted mono code chip and a "with code" label (hidden
  below `sm` to stay compact) so it's unambiguous which piece is the code to type in at checkout.
  A `fixed`-type discount still has no currency to format an amount in on a marketplace-wide
  ticker (§39's reasoning — this is a genuinely multi-currency platform) — resists the tempting
  shortcut of guessing a currency from the visitor's locale (locale ≠ currency; a wrong guess is
  worse than no number at all) and uses a clear generic phrase instead ("Enjoy a special discount
  on your order").

Visually verified before shipping — a throwaway Playwright script (see `[[playwright_verification_technique]]`
memory note) drove the local dev server and screenshotted the homepage (desktop + mobile), the
light-background `/restaurants` page, and captured two frames ~6s apart to confirm the crossfade
rotation genuinely swaps codes, using a temporary in-file data override (reverted before
committing) since no promo code happened to be active in the local dev database.

`tsc --noEmit`/`eslint`/production `build` clean on both sides. New `PromoTicker` i18n namespace
(`percentHeadline`, `amountHeadlineGeneric`, `withCode`) shipped in all 6 languages, key parity
verified; the now-unused `PromoBanner.amountOffGeneric` key (added in §39, no longer read once
`PromoBanner` reverted to always requiring `currency`) was removed from all 6 files rather than
left as dead weight.

## 41. Unified `PromoTicker` and `PromoBanner` into one component (docs/ROADMAP.md FDP-119)

Immediate follow-up feedback on §40's redesign: the floating ticker looked right on the
marketplace-wide pages, but a restaurant/store's own page (`/restaurants/[slug]`,
`/stores/[slug]`) was still showing the old `PromoBanner` — a full-width `Alert` box, the exact
thing §40 had just replaced everywhere else. Rather than maintaining two visually-inconsistent
promo-discovery components going forward, `PromoTicker` absorbed `PromoBanner`'s job entirely:

- `PromoTicker` now takes **optional** `restaurantId`/`storeId`/`currency` props. With them, it
  queries codes scoped to that exact business (`useGetActivePromoCodesQuery({ restaurantId })` —
  the same `findActiveForSeller` backend path §39 already built, unchanged) and, since the
  business's own currency is now known, can format a `fixed`-type discount as a real amount
  (`amountHeadline`, a new key) and show the `minOrderAmount` note — both previously only
  possible in the old `PromoBanner`. Without them, it's exactly §40's marketplace-wide ticker,
  unchanged: platform-wide codes only, `fixed`-type discounts get the currency-free
  `amountHeadlineGeneric` phrase, no min-order note (no currency to format it in).
- `PromoBanner` (`frontend/src/components/promo-banner.tsx`) is now genuinely unused —
  confirmed via a repo-wide grep before deleting it, rather than leaving a dead component behind
  "just in case." Its i18n namespace (`PromoBanner.title`/`useCodeFor`/`percentOff`/`amountOff`/
  `minOrder`) was removed from all 6 locale files in the same change, not left as orphaned keys.
- `restaurants/[slug]/page.tsx` and `stores/[slug]/page.tsx` now render
  `<PromoTicker restaurantId={restaurant._id} currency={restaurant.currency} />` /
  `<PromoTicker storeId={store._id} currency={store.currency} />` in the exact spot `PromoBanner`
  used to sit — visually this makes no difference (the ticker is `position: fixed` regardless of
  where in the JSX tree it's mounted, per §40), but keeps the mount point co-located with the
  business data it needs, matching every other page's pattern.

One component, one visual treatment, for every place in the app a promo code needs to surface —
the scoping (platform-wide vs. one business) and currency-awareness are purely data-layer
concerns now, not a reason to fork the UI. `tsc --noEmit`/`eslint`/production `build` clean on
both sides. `PromoTicker`'s i18n namespace gained `amountHeadline`/`minOrderNote` in all 6
languages, key parity verified.

## 42. Corrected the Youverify integration against the real API (docs/ROADMAP.md FDP-120)

§38 built `BusinessVerificationService` against a best-effort guess of Youverify's API, explicitly
flagged as unverified since no real account existed. The user added a real sandbox key and a real
business number to test it end-to-end, which turned into a genuine live-debugging session rather
than a clean success — worth recording precisely, since every wrong guess here was corrected
against real evidence, not further guessing.

**What was actually wrong, found by live-testing against the real account:**
- **Auth header (`token`) and the general shape were right** — a request with a valid key got a
  specific business-logic error back, not a generic 404 or "missing token," proving both were
  correctly implemented from the start.
- **Base URL needed to be environment-aware.** Hitting the production host
  (`api.youverify.co`) with a sandbox key returned an explicit
  `"Unauthorized: You cannot make a request to PRODUCTION environment from STAGING environment"`
  — Youverify rejects the mismatch outright rather than silently degrading. Fixed with a new
  optional `YOUVERIFY_BASE_URL` (defaults to production), the same pattern `TERMII_BASE_URL`
  already establishes in this codebase — a sandbox key sets this to
  `https://api.sandbox.youverify.co`.
- **The endpoint itself was wrong.** The guessed `global/company-advance-check` path doesn't
  exist. Youverify's real docs live at `doc.youverify.co` (no `s`) — `docs.youverify.co` (the
  URL guessed first) 404s outright, a trap easy to fall into. The real, documented endpoint for
  Nigerian business verification is `POST /v2/api/verifications/ng/company/basic` — Nigeria-
  specific by design (the `ng` segment), the only KYB endpoint this integration targets; a non-
  Nigerian `registrationNumber` simply won't be found, which the existing `mismatch`/`unknown`
  handling already treats safely.
- **Request/response field names were wrong.** Real shape: request is
  `{ registrationNumber, isConsent: true }` (`isConsent` reflects the vendor verifying their own
  business during their own onboarding, not a third party's), where `registrationNumber` must
  carry its real CAC prefix (`RC`/`BN`/`IT`/`LP`/`LLP`, no space) — Youverify rejects a bare
  number. Response success fields are `name`/`status` (`"found"` vs. not)/`companyStatus`
  (`"ACTIVE"` etc.) — not the guessed `companyName`/`address`; this basic-tier endpoint doesn't
  return an address at all, so `registeredAddress` in `BusinessVerificationOutcome` is now always
  `null` from this endpoint (the type is left as-is for API stability/future endpoints that might
  populate it).

**What's still unresolved, and isn't a code problem**: even against the corrected endpoint, with
`YOUVERIFY_BASE_URL` pointed at sandbox, the live test account gets `403 Permission denied` —
confirmed against three different real, documented endpoints (not 404s), meaning the request
genuinely reaches Youverify and is being evaluated, but the account's KYB/company-check product
isn't enabled on that key/plan yet, even after the user enabled "Run Company Check on Entity" in
Youverify's dashboard permissions UI. This needs the user's own follow-up with Youverify (dashboard
or support) — not something resolvable from this codebase. Until it is, the integration correctly
falls back to the manual admin queue exactly as designed, same as if the key were entirely unset.

Unit tests updated to the corrected request/response shape, plus a new test asserting
`YOUVERIFY_BASE_URL` is actually used when set. Full backend suite green (653/653);
`tsc --noEmit`/`eslint` clean.

## 43. Redesigned the homepage FAQ accordion (docs/ROADMAP.md FDP-121)

Direct design feedback, screenshot-annotated: the FAQ accordion looked "basic," had no smooth
animation, and opening a new question should close whichever one was already open — the original
build (§31, FDP-107) was a deliberate independent-toggle accordion (more than one open at once,
matching common FAQ-page behavior), which the user explicitly wants replaced with single-open.

`Accordion`/`AccordionItem` (`frontend/src/components/ui/accordion.tsx`) redesigned:
- **Cards, not a flat list**: each question is its own `rounded-2xl` card (`flex flex-col gap-3`
  between them) rather than a `divide-y` list — while open, the card gets a brand-tinted
  background (`bg-primary-subtle/40`), a `border-primary/30` border, and a `shadow-sm`, so the
  active question visually pops rather than just having its chevron flipped.
- **Chevron badge**: the trigger's chevron now sits inside a circular badge (`size-7
  rounded-full`) that's a neutral `bg-secondary` when closed and fills solid `bg-primary` (with
  the chevron itself rotating 180°) when open — the same "circular icon badge" motif this session
  already established for `PromoTicker`'s tag icon, reused deliberately for visual consistency
  across the app rather than inventing a new treatment.
- **Real animation, not conditional mount**: the previous version used `{open && <div>...}` — an
  instant pop with zero transition. Replaced with a pure-CSS "auto height" technique: the panel
  wrapper animates `grid-template-rows` between `0fr` and `1fr` (`transition-[grid-template-rows]
  duration-300`), with an inner `overflow-hidden` clipping it and an opacity fade layered on top
  so the answer text eases in rather than appearing the instant the row finishes growing. This is
  simpler than a JS-measured `max-height` (no `ResizeObserver`/ref math) and avoids pulling in an
  animation library for one component.
- **Single-open-at-a-time**: `openIndex` state moved from each `AccordionItem` up to the parent
  `Accordion`, so opening one item can close whichever other one was open — a real behavior
  change from FDP-107's original independent-toggle design, made because the user explicitly
  asked for it this time, not a default worth assuming for every future accordion in this
  codebase.
- **`aria-hidden` on the collapsed panel**: since the panel now stays mounted at zero height
  (needed for the CSS transition) instead of unmounting, it's marked `aria-hidden={!open}` —
  correct for assistive tech (a screen reader shouldn't read a zero-height answer as if it were
  visible), and also the only deterministic "is this actually closed" signal for tests, since
  jsdom doesn't compute real CSS grid-row layout. `accordion.test.tsx` updated to check
  `aria-hidden` instead of DOM presence for the two tests that previously asserted
  `queryByText(...).not.toBeInTheDocument()` (no longer true — the text is always in the DOM now,
  just visually and semantically hidden), and the independent-toggle test was replaced with one
  asserting the new single-open behavior.

Only usage in the codebase is the homepage FAQ, confirmed via a repo-wide grep before changing the
default behavior — no other page silently inherited a behavior change. Visually verified in a real
browser (light and dark mode, both the closed state and opening a second item while the first was
open) via a throwaway Playwright script against the local dev server before shipping.
`tsc --noEmit`/production `build`/`vitest` (5/5, including the two rewritten tests) all clean.
