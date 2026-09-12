"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The mobile counterpart to a wide data table (docs/ROADMAP.md FDP-129): a card with an
// always-visible summary and a toggleable stacked detail grid below it, instead of forcing
// horizontal scrolling on a narrow viewport. Unlike `Accordion` (single-open-at-a-time, built for
// an FAQ list), any number of these can be open at once — comparing two transactions side by side
// is a real use case for a list of many rows, not something to actively prevent.
export function DetailDisclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border transition-colors duration-200",
        open ? "border-primary/30 bg-primary-subtle/20" : "border-border bg-surface",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <div className="min-w-0 flex-1">{summary}</div>
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full transition-all duration-300 ease-out",
            open ? "rotate-180 bg-primary text-text-on-primary" : "bg-secondary text-text-muted",
          )}
        >
          <ChevronIcon className="size-3.5" />
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            aria-hidden={!open}
            className={cn(
              "flex flex-col divide-y divide-border border-t border-border px-4 pb-1 pt-2 transition-opacity duration-300",
              open ? "opacity-100 delay-100" : "opacity-0",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A single label/value line inside a `DetailDisclosure`'s stacked detail grid. */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="text-right font-medium text-text">{value}</span>
    </div>
  );
}
