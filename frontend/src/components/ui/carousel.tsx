"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
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
  /** Pixels/second of continuous drift — a slow, gentle news-ticker-style glide rather than
   * periodic large jumps (docs/ROADMAP.md FDP-68: the original setInterval-jump version read as
   * fast and jarring, not appealing). 0 disables auto-scroll (manual arrows/swipe only). */
  speed?: number;
  "aria-label": string;
}

// Small, frequent steps rather than one rAF loop — keeps this trivially testable with fake
// timers (no requestAnimationFrame mocking needed) while still reading as continuous motion at
// 30ms granularity.
const TICK_MS = 30;

/**
 * A horizontally auto-scrolling carousel (docs/ROADMAP.md FDP-66, motion redesigned in FDP-68)
 * — native touch/drag scrolling under the hood (so swipe and keyboard scrolling work for free,
 * no reinventing gesture handling) with a continuous slow `scrollLeft` drift on top for the
 * "moving on its own" feel, plus prev/next buttons for discoverable manual paging. No
 * scroll-snap: snap points fight a slow continuous programmatic drift (each tiny step gets
 * fought/corrected by the browser's own snap behavior), so this trades snap-to-card for a
 * smooth glide instead. Pauses on hover/focus/touch (a carousel that fights the user's own
 * scroll attempt is worse than a static rail) and respects `prefers-reduced-motion` entirely
 * (no auto-scroll at all).
 */
export function Carousel({ children, className, itemClassName, speed = 30, ...props }: CarouselProps) {
  const t = useTranslations("Common");
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [edge, setEdge] = useState({ atStart: true, atEnd: false });

  function syncEdge(track: HTMLDivElement) {
    setEdge({
      atStart: track.scrollLeft <= 4,
      atEnd: track.scrollLeft + track.clientWidth >= track.scrollWidth - 4,
    });
  }

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => syncEdge(track);
    onScroll();
    track.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      track.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [children.length]);

  useEffect(() => {
    if (!speed || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const pxPerTick = (speed * TICK_MS) / 1000;
    const id = setInterval(() => {
      const track = trackRef.current;
      if (!track) return;
      const maxScroll = track.scrollWidth - track.clientWidth;
      if (maxScroll <= 0) return;
      const next = track.scrollLeft + pxPerTick;
      track.scrollLeft = next >= maxScroll ? 0 : next;
      syncEdge(track);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [speed, paused]);

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
        className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children.map((child, i) => (
          <div key={i} className={cn("shrink-0", itemClassName)}>
            {child}
          </div>
        ))}
      </div>
      <IconButton
        label={t("previous")}
        icon={<ChevronLeftIcon />}
        size="sm"
        variant="outline"
        disabled={edge.atStart}
        onClick={() => scrollByPage(-1)}
        className="absolute top-1/2 left-2 hidden -translate-y-1/2 bg-surface shadow-md disabled:opacity-0 sm:flex"
      />
      <IconButton
        label={t("next")}
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
