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

## Local dev

```
npm run dev        # http://localhost:3000
npm run lint
npm run build
```

`.env.example` documents required env vars — copy to `.env.local` for local dev, never commit
real values.
