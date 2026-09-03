import { notFound } from "next/navigation";

// Next.js only walks up to a segment's own `not-found.tsx` when a matched route explicitly
// calls `notFound()` — a URL that matches no page at all (e.g. `/fr/some-garbage-path`) falls
// straight through to the true-root `app/not-found.tsx` otherwise, skipping the translated,
// AppShell-wrapped boundary at `app/[locale]/not-found.tsx` entirely (docs/ROADMAP.md FDP-71).
// This catch-all exists purely to give every unmatched in-scope path a real route to match,
// whose only job is calling `notFound()` so the *sibling* `not-found.tsx` actually renders.
export default function LocaleCatchAll(): never {
  notFound();
}
