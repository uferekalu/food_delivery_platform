"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface AccordionEntry {
  question: string;
  answer: ReactNode;
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AccordionItem({
  question,
  answer,
  open,
  onToggle,
}: AccordionEntry & { open: boolean; onToggle: () => void }) {
  const id = useId();
  const buttonId = `${id}-button`;
  const panelId = `${id}-panel`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border transition-colors duration-200",
        open ? "border-primary/30 bg-primary-subtle/40 shadow-sm" : "border-border bg-surface hover:border-border-strong",
      )}
    >
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className={cn("text-sm font-semibold transition-colors duration-200", open ? "text-primary" : "text-text")}>
            {question}
          </span>
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full transition-all duration-300 ease-out",
              open ? "rotate-180 bg-primary text-text-on-primary" : "bg-secondary text-text-muted",
            )}
          >
            <ChevronIcon className="size-3.5" />
          </span>
        </button>
      </h3>
      {/* Pure-CSS "auto height" reveal via an animatable `grid-template-rows` (0fr <-> 1fr) —
          smoother than a JS-measured max-height and simpler than mount/unmount, which is why the
          panel stays in the DOM at zero height rather than conditionally rendering. The inner
          `overflow-hidden` wrapper is what the 0fr row actually clips; the opacity fade on top of
          it is purely cosmetic polish so the answer eases in rather than popping the instant the
          row finishes growing. `aria-hidden` on the panel keeps assistive tech from reading a
          zero-height answer as if it were visible content, and doubles as the one deterministic
          "is this panel actually closed" signal for tests — CSS grid-row collapse itself isn't
          something jsdom can observe. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            aria-hidden={!open}
            className={cn(
              "px-5 pb-5 text-sm text-text-muted transition-opacity duration-300",
              open ? "opacity-100 delay-100" : "opacity-0",
            )}
          >
            {answer}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A single-open-at-a-time list of question/answer disclosures — opening one smoothly closes
 * whichever other item was open, matching the request that clicking a new question should
 * collapse the previous answer rather than stacking several open at once. State lives here, not
 * per-item, so items can coordinate. */
export function Accordion({ items, className }: { items: AccordionEntry[]; className?: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {items.map((item, index) => (
        <AccordionItem
          key={item.question}
          question={item.question}
          answer={item.answer}
          open={openIndex === index}
          onToggle={() => setOpenIndex((current) => (current === index ? null : index))}
        />
      ))}
    </div>
  );
}
