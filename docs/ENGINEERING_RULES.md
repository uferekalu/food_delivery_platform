# Engineering Rules

Concrete, enforceable rules for working in this repo. `CLAUDE.md` summarizes the highlights;
this file is the detailed version.

## Branching & PRs

- **Never push directly to `main`/`master`.** All work happens on a branch named
  `feature/FDP-<number>-<short-description>` (e.g. `feature/FDP-4-auth`).
- The next ticket number lives at the top of `docs/ROADMAP.md` — read it before creating a
  branch, and bump it in the same commit that creates the branch's first commit.
- One phase/ticket per branch. Don't bundle unrelated work into an existing branch.
- After pushing a branch, open a PR against `main` with a summary of what changed and a test
  plan. As of 2026-08-17, the repo owner has asked Claude to merge these PRs itself once
  pushed (after they hit repeated GitHub UI trouble merging manually) — so unless told
  otherwise, open the PR and then merge it (squash, delete branch), rather than leaving it
  for manual merge. Still never push directly to `main` — every change goes through a PR,
  it's just that Claude now clicks merge instead of the repo owner. Revert to manual-merge if
  the user asks.
- Commit messages: short imperative summary line, body explains *why* when non-obvious.

## Secrets

- No secret ever gets committed — not in code, not in `.env`, not in a comment, not in a
  fixture. Real values live in local `.env` (gitignored) and in Vercel/Render project settings.
- Every required env var is documented in the relevant app's `.env.example` with a placeholder
  and a one-line note on where to obtain it.
- If a secret is ever accidentally committed, treat it as compromised: rotate it, then scrub
  history — don't just delete it in a follow-up commit.

## Code quality gates (must pass before a branch is considered done)

- **Backend:** `npm run lint`, `npm run typecheck` (or `tsc --noEmit`), `npm run test`, app
  boots locally against a real/emulated MongoDB
- **Frontend:** `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` succeeds
- New business logic gets a unit test. New API endpoints get at least one e2e test covering the
  happy path and one failure path (validation error / auth failure).
- Every payment webhook handler has a test asserting it rejects an invalid signature.

## Database migrations (docs/ROADMAP.md FDP-88)

- Adding a new **optional** field with a sensible default needs nothing extra — Mongoose already
  handles a document that predates the field (it reads back as `undefined`/the schema default).
- Anything that **transforms or depends on existing documents' shape** needs a real
  `migrate-mongo` migration in the same branch as the schema change: renaming/removing a field
  that has real data, changing a field's type or shape, backfilling a new *required* field, or
  any change where an old document would otherwise fail validation or silently misbehave under
  the new schema.
- Create one with `npm run migrate:create -- <name>` (from `backend/`), write both `up()` and
  `down()`, and run `npm run migrate:up` against your local database before opening the PR to
  confirm it actually applies cleanly. See docs/ARCHITECTURE.md §15 for the full setup.

## Validation & error handling

- Every backend endpoint validates input via a DTO (`class-validator`) — no raw `req.body`
  access.
- Every frontend form validates via Zod + React Hook Form before submit.
- Payment/order state transitions only happen server-side from verified events (webhook
  signature verified, or an explicit authenticated verify() call) — never trust a client claim
  that a payment succeeded.

## Accessibility

- Hand-built UI kit components (Select, Dialog, Combobox, DropdownMenu, RadioGroup, Tabs) must
  implement correct ARIA roles, keyboard navigation, and focus management — this is a
  requirement, not a nice-to-have, since there's no Radix/shadcn safety net under them.

## Design tokens & UI kit discipline

- No component may hardcode a color, spacing value, font size, or radius that isn't a token
  from `frontend/src/styles/tokens.ts`. If a value is needed that isn't a token, add it to the
  token file first.
- No page-level component reaches for a raw `<button>`/`<input>`/etc. when a UI kit component
  exists for it — extend the UI kit rather than one-off styling a raw element.

## Documentation upkeep

- `docs/PRODUCT_GUIDE.md` changes when requirements change — keep it current, not historical.
- `docs/ROADMAP.md` status column is updated when a phase starts/finishes.
- New architectural decisions (new module, new external dependency, a schema change to a core
  entity) get reflected in `docs/ARCHITECTURE.md` in the same branch that introduces them.
