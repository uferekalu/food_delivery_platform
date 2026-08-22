@AGENTS.md

# Frontend conventions

Full architecture/rationale: `../docs/ARCHITECTURE.md`. This file is the quick-reference for
working inside `frontend/`.

## Stack specifics

- Next.js App Router, TypeScript, Tailwind CSS v4 (CSS-first — theme lives in
  `src/styles/tokens.css` under `@theme`, there is no `tailwind.config.ts`).
- State: Redux Toolkit + RTK Query only (`src/lib/redux/`). Server data always goes through
  `api.injectEndpoints()` on the single `api` instance in `src/lib/redux/api.ts` — never a
  second `createApi()` call, never server data duplicated into a plain slice. Components use
  `useAppDispatch`/`useAppSelector` from `src/lib/redux/hooks.ts`, never the untyped
  `react-redux` hooks directly.
- UI kit: hand-built, `src/components/ui/`, no Radix/shadcn. Always reach for an existing kit
  component over a raw HTML element; extend the kit if one doesn't exist yet.
- Design tokens: `src/styles/tokens.css` (CSS custom properties, source of truth) +
  `src/styles/tokens.ts` (typed `var()` accessors for the rare non-Tailwind consumer). Use
  Tailwind utilities (`bg-primary`, `text-text-muted`, …) in components; don't hardcode colors/
  spacing/radius.
- Theming: token-driven light/dark, see `../docs/ARCHITECTURE.md` §7. Never branch component
  code on a dark-mode flag — only ever read semantic tokens.
- Responsive: mobile-first, `sm:` (640px) is the one breakpoint that matters for most layouts —
  design for a ~375px viewport first, then widen. See "Responsive design" below.

## Responsive design (FDP-6)

Every page must work at a 375px viewport, not just degrade gracefully — audited and retrofitted
in FDP-6 after several real overflow/off-screen bugs shipped in earlier phases (unwrapped header
row, `DropdownMenu` rendering off-viewport, sub-44px tap targets).

- **Grids**: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (never a fixed multi-column grid with
  no 1-column fallback below `sm`).
- **Primary nav**: the root header (`src/app/layout.tsx`) shows inline auth/theme controls only
  at `sm:` and up (`hidden ... sm:flex`); below that, `MobileNav` (`src/components/mobile-nav.tsx`)
  collapses them into a hamburger-triggered `Modal` rather than letting them wrap/overflow. Any
  new header-level control goes through this pattern, not directly into the inline row.
- **Any row of controls that could grow** (button groups, badge lists, form field groups) needs
  `flex-wrap` or an explicit `grid-cols-1 sm:grid-cols-N`; never assume the row always fits.
- **Touch targets**: standalone icon actions (modal close, hamburger, theme toggle) are 44px
  (`IconButton` default `md` size) per the WCAG target-size guideline `PRODUCT_GUIDE.md`
  commits to. Icon buttons inside dense rows (a delete icon per list row) may use `size="sm"`
  (36px) instead — still clears the WCAG 2.5.8 AA minimum (24px) given normal row spacing; don't
  drop below that without a specific reason.
- **Overlay/positioned components** (`DropdownMenu`, anything computing its own
  `top`/`left` from `getBoundingClientRect`) must clamp to the viewport after render — see
  `DropdownMenu`'s two-pass measure-then-clamp effect for the pattern. Don't ship a
  self-positioned overlay without this; it's silently invisible/unreachable near a screen edge,
  which is common on mobile.
- **Horizontally-scrollable content** (tab strips, wide tables) needs an explicit
  `overflow-x-auto` wrapper with non-shrinking children (`shrink-0`) — don't let content wrap
  awkwardly or clip with no way to reach it.

## Known ESLint friction (React Compiler rules)

`eslint-config-next` ships `eslint-plugin-react-hooks`'s newer React-Compiler-oriented rules
(`react-hooks/refs`, `react-hooks/set-state-in-effect`). Two patterns it flags as false
positives, already handled in this codebase with a narrow `eslint-disable-next-line` +
justification comment — don't re-litigate these, follow the same approach for new instances:

1. **Prop-getter / render-prop ref forwarding** (`Tooltip`, `DropdownMenu`): building a props
   object containing a `ref` key during render, handed to the caller via a function prop rather
   than `cloneElement`, is safe — the ref is only actually attached once the caller spreads it
   onto real JSX. The rule can't see through the indirection.
2. **Lazy ref initialization read** (`StoreProvider`): Redux Toolkit's documented Next.js App
   Router pattern (`if (storeRef.current === null) { storeRef.current = makeStore() }` then
   reading `storeRef.current`) is exactly the sanctioned lazy-init pattern, but the rule still
   flags the read that follows the guard.

For a genuinely new `setState`-in-effect case, fix it for real (e.g. the
`useSyncExternalStore` trick in `src/lib/theme.ts` / `src/components/ui/portal.tsx`) rather than
reaching for a suppression — these two are the only known false positives so far.

## RTK Query gotchas hit building auth (FDP-4) — apply to every future endpoint

1. **Always wrap `await queryFulfilled` in `onQueryStarted` in try/catch.** It's a separate
   promise chain from the calling component's own `.unwrap().catch(...)` — an uncaught
   rejection there (e.g. a mutation that's *expected* to sometimes fail, like `refresh` for an
   anonymous visitor, or `login` with a wrong password) surfaces as a real unhandled-rejection
   page error, independent of whatever error handling the component does. See
   `src/lib/redux/services/auth-api.ts` for the pattern: `onQueryStarted` only reacts to
   *success* (syncing Redux); failures are silently swallowed there and handled by the
   component via `getErrorMessage` (`src/lib/redux/error.ts`).
2. **Never send a form's full values object straight to a mutation** if the form has
   client-only fields (e.g. `confirmPassword`). The backend's `ValidationPipe` uses
   `forbidNonWhitelisted: true` — an extra field fails the *entire* request with a 400, not
   just a validation warning on that field. Always construct the mutation payload explicitly
   (`{ name: values.name, email: values.email, password: values.password }`), never
   `mutation(values)`.
3. **The base query auto-refreshes on a 401** (`src/lib/redux/api.ts`'s `baseQueryWithReauth`,
   FDP-6) — access tokens are ~15 min (`docs/ARCHITECTURE.md` §11), so any endpoint hit after
   that window would otherwise surface a bare 401 to whoever's still on the page. On a 401 (from
   anything except `/auth/login`, `/auth/register`, `/auth/refresh` itself — a 401 there means
   actually-not-authenticated, not expiry), it silently calls `/auth/refresh` once via the
   httpOnly cookie and retries the original request; session is only cleared if that refresh
   also fails. An `async-mutex` lock serializes concurrent 401s so N simultaneous queries don't
   each fire their own refresh against the single-use rotating refresh token. New endpoints get
   this for free through the shared `api` instance — don't add per-endpoint 401 handling.

## Local dev

```
npm run dev        # http://localhost:3000
npm run lint
npm run build
```

`.env.example` documents required env vars — copy to `.env.local` for local dev, never commit
real values.
