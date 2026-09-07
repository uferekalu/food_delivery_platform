"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface AccordionEntry {
  question: string;
  answer: ReactNode;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className={cn("size-4 shrink-0 text-text-muted transition-transform duration-150", open && "rotate-180")}
    >
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AccordionItem({ question, answer }: AccordionEntry) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const buttonId = `${id}-button`;
  const panelId = `${id}-panel`;

  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-4 text-left text-sm font-medium text-text transition-colors duration-150 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span>{question}</span>
          <ChevronIcon open={open} />
        </button>
      </h3>
      {open && (
        <div id={panelId} role="region" aria-labelledby={buttonId} className="pt-3 text-sm text-text-muted">
          {answer}
        </div>
      )}
    </div>
  );
}

/** A list of independently-toggling question/answer disclosures — each item manages its own open
 * state (more than one can be open at once), matching common FAQ-page behavior rather than a
 * single-open-at-a-time accordion. */
export function Accordion({ items, className }: { items: AccordionEntry[]; className?: string }) {
  return (
    <div className={className}>
      {items.map((item) => (
        <AccordionItem key={item.question} question={item.question} answer={item.answer} />
      ))}
    </div>
  );
}
