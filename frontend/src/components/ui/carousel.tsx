"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "./icon-button";

function ChevronLeftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface CarouselProps {
  children: ReactNode[];
  className?: string;
  /** Applied to each slide's wrapper — set a width here (e.g. "w-72") since children scroll
   * horizontally at their own intrinsic/assigned width, not stretched to fill the track. */
  itemClassName?: string;
  /** ms between auto-advances; 0 disables auto-advance (manual arrows/swipe only). */
  autoAdvanceMs?: number;
  "aria-label": string;
}

/**
 * A horizontally auto-advancing carousel (docs/ROADMAP.md FDP-66) — native scroll-snap + touch
 * scrolling under the hood (so drag/swipe and keyboard scrolling work for free, no reinventing
 * gesture handling) with a `setInterval` nudging `scrollBy` on top for the "moving on its own"
 * feel, plus prev/next buttons for discoverable manual control. Pauses auto-advance on
 * hover/focus/touch (a carousel that fights the user's own scroll attempt is worse than a
 * static rail) and respects `prefers-reduced-motion` entirely (no auto-advance at all).
 */
export function Carousel({ children, className, itemClassName, autoAdvanceMs = 4000, ...props }: CarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [edge, setEdge] = useState({ atStart: true, atEnd: false });

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const updateEdge = () => {
      setEdge({
        atStart: track.scrollLeft <= 4,
        atEnd: track.scrollLeft + track.clientWidth >= track.scrollWidth - 4,
      });
    };
    updateEdge();
    track.addEventListener("scroll", updateEdge, { passive: true });
    window.addEventListener("resize", updateEdge);
    return () => {
      track.removeEventListener("scroll", updateEdge);
      window.removeEventListener("resize", updateEdge);
    };
  }, [children.length]);

  useEffect(() => {
    if (!autoAdvanceMs || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = setInterval(() => {
      const track = trackRef.current;
      if (!track) return;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      track.scrollTo(
        atEnd ? { left: 0, behavior: "smooth" } : { left: track.scrollLeft + track.clientWidth * 0.85, behavior: "smooth" },
      );
    }, autoAdvanceMs);
    return () => clearInterval(id);
  }, [autoAdvanceMs, paused]);

  function scrollByPage(direction: 1 | -1) {
    trackRef.current?.scrollBy({ left: trackRef.current.clientWidth * 0.85 * direction, behavior: "smooth" });
  }

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div
        ref={trackRef}
        role="region"
        aria-label={props["aria-label"]}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children.map((child, i) => (
          <div key={i} className={cn("shrink-0 snap-start", itemClassName)}>
            {child}
          </div>
        ))}
      </div>
      <IconButton
        label="Previous"
        icon={<ChevronLeftIcon />}
        size="sm"
        variant="outline"
        disabled={edge.atStart}
        onClick={() => scrollByPage(-1)}
        className="absolute top-1/2 left-2 hidden -translate-y-1/2 bg-surface shadow-md disabled:opacity-0 sm:flex"
      />
      <IconButton
        label="Next"
        icon={<ChevronRightIcon />}
        size="sm"
        variant="outline"
        disabled={edge.atEnd}
        onClick={() => scrollByPage(1)}
        className="absolute top-1/2 right-2 hidden -translate-y-1/2 bg-surface shadow-md disabled:opacity-0 sm:flex"
      />
    </div>
  );
}
