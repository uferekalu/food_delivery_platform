# Frontend — Food Delivery Platform

Next.js (App Router) + TypeScript app for the food/grocery/pharmacy delivery platform. See the
[repo root README](../README.md) for the full-project overview, and
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the technical source of truth. Frontend-
specific conventions (design tokens, the hand-built UI kit, i18n, state layer rules) are in
[`CLAUDE.md`](./CLAUDE.md).

## Stack

Next.js App Router, TypeScript, Tailwind CSS on top of a hand-built, token-driven design system
(no Radix/shadcn — see `src/styles/tokens.css`/`tokens.ts`), Redux Toolkit + RTK Query as the
single state layer (RTK Query for all server data, plain slices for client/UI state like theme
and the cart drawer), React Hook Form + Zod for every form, Socket.IO client for realtime order
updates, Mapbox GL for live delivery tracking, `next-intl` for i18n, Vitest + React Testing
Library for component tests. Deployed to **Vercel** (see
[`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md)).

## Setup

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL should point at a running backend;
                              # everything else is optional and degrades gracefully when unset
```

## Running

```bash
npm run dev      # http://localhost:3000
npm run build     # production build — also the strongest overall correctness check
npm run start      # serve the production build locally
```

## Internationalization

Six locales are supported: English (default), French, Spanish, Portuguese, German, Chinese
(`src/i18n/routing.ts`). Every new user-facing string ships in all six locale files
(`messages/*.json`) in the same change — there is no separate translation follow-up step.

## Design system

Colors, spacing, typography, and radius are **never hardcoded** in components — they come from
`src/styles/tokens.ts` (typed accessors over `src/styles/tokens.css`, the source of truth). If a
component needs a value that isn't already a token, add the token first. The UI kit lives under
`src/components/ui/` and is hand-built rather than pulled from a component library, so it can be
fully token-driven and support light/dark theming out of the box (`docs/ARCHITECTURE.md` §7).

## Testing

```bash
npm run test         # component tests (Vitest + React Testing Library)
npm run test:watch    # watch mode
npm run lint           # eslint
npx tsc --noEmit        # type-check
```

There is no Playwright dependency committed to the project — live end-to-end verification during
development is done by importing Chromium directly from the local `npx` cache via a `file://`
URL in a throwaway script, driving a real dev server. See `docs/ARCHITECTURE.md` for examples of
this pattern in past tickets' verification notes.

## Project structure

```
src/
  app/[locale]/           Routes (App Router), one folder per page, grouped by locale
  components/              Shared components; components/ui/ is the hand-built design-system kit
  lib/redux/               Store, slices, and RTK Query API services (one file per domain)
  lib/                     Non-Redux utilities (currency formatting, opening-hours logic, etc.)
  i18n/                    next-intl routing/config
  styles/                  Design tokens (CSS custom properties + typed TS accessors)
messages/                  One JSON file per locale, flat-ish key namespaces per page/component
```
