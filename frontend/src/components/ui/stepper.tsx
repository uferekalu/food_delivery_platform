import { cn } from "@/lib/cn";

export interface StepperStep {
  key: string;
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Index of the current/last-reached step. -1 means none of the steps have been reached yet. */
  currentIndex: number;
  className?: string;
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Presentational only — no keyboard interaction, so it's exempt from the UI kit's usual
 * roving-tabindex/ARIA-widget bar (frontend/CLAUDE.md); a plain ordered list with visually
 * hidden state text is enough for screen readers. */
export function Stepper({ steps, currentIndex, className }: StepperProps) {
  return (
    <ol className={cn("flex flex-col gap-6 sm:flex-row sm:gap-0", className)}>
      {steps.map((step, index) => {
        const completed = index < currentIndex;
        const current = index === currentIndex;
        const status = completed ? "Completed" : current ? "Current" : "Upcoming";

        return (
          <li key={step.key} className="relative flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
            {index > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-4 right-1/2 hidden h-0.5 w-full -translate-y-1/2 sm:block",
                  index <= currentIndex ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-surface text-sm font-semibold",
                completed && "border-primary bg-primary text-primary-foreground",
                current && "border-primary text-primary",
                !completed && !current && "border-border-strong text-text-muted",
              )}
            >
              {completed ? <CheckIcon /> : index + 1}
            </span>
            <span className={cn("text-sm", current ? "font-semibold text-text" : completed ? "text-text" : "text-text-muted")}>
              {step.label}
              <span className="sr-only"> ({status})</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
