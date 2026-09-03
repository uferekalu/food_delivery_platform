import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";

function LostPlateIllustration() {
  return (
    <svg aria-hidden="true" viewBox="0 0 160 160" fill="none" className="size-40 sm:size-48">
      <circle cx="80" cy="80" r="72" className="fill-primary-subtle" />
      <circle cx="80" cy="86" r="46" fill="none" stroke="var(--color-border-strong)" strokeWidth="2.5" />
      <circle cx="80" cy="86" r="33" fill="none" stroke="var(--color-border-strong)" strokeWidth="2.5" />
      <path
        d="M58 70l7 7M65 70l-7 7M58 62v14"
        stroke="var(--color-primary)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M100 62c-5 0-8.5 4.5-8.5 10s3.5 10 8.5 10v14"
        stroke="var(--color-primary)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M36 40l10 8-6 10-11-5z"
        className="fill-surface"
        stroke="var(--color-border-strong)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M112 34l14 4-2 12-14-2z"
        className="fill-surface"
        stroke="var(--color-border-strong)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface NotFoundContentProps {
  eyebrow: string;
  title: string;
  description: string;
  /** The caller builds this — a `Link`/`SmartLink`/plain `<a>` styled with `buttonVariants`,
   * whichever fits where this renders. Passed as a node rather than a component reference so
   * this file never has to reconcile the different `Link` implementations' prop types. */
  homeButton: React.ReactNode;
  className?: string;
}

/**
 * Shared visual content for every "page not found" boundary in the app (docs/ROADMAP.md
 * FDP-71) — `app/[locale]/not-found.tsx`, `app/(untranslated)/not-found.tsx`, and the true-root
 * `app/not-found.tsx` fallback each render this with their own translated strings and home-link
 * button, replacing Next.js's plain default "404 / This page could not be found." text.
 */
export function NotFoundContent({ eyebrow, title, description, homeButton, className }: NotFoundContentProps) {
  return (
    <Container className={cn("flex flex-1 flex-col items-center justify-center gap-6 py-20 text-center", className)}>
      <LostPlateIllustration />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold tracking-wide text-primary uppercase">{eyebrow}</span>
        <h1 className="text-2xl font-bold text-balance text-text sm:text-3xl">{title}</h1>
        <p className="mx-auto max-w-md text-text-muted">{description}</p>
      </div>
      {homeButton}
    </Container>
  );
}
