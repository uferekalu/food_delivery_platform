"use client";

import { cn } from "@/lib/cn";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Portal } from "./portal";
import { IconButton } from "./icon-button";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Off-canvas panel sliding in from the right — used for primary navigation (see `MobileNav`),
 * where a centered `Modal` reads as an interruption rather than a navigation surface. Shares
 * `Modal`'s focus-trap/Escape/body-scroll-lock a11y logic; the only real differences are the
 * fixed-to-an-edge layout and the slide transition.
 *
 * Deliberately does NOT nest a `DropdownMenu`-based control anywhere inside it (see
 * `MobileNav`'s inline theme switcher) — `DropdownMenu` portals to `document.body` at
 * `--z-dropdown` (1000), which sits *below* this drawer's `--z-modal` (1300) backdrop in the
 * same top-level stacking context, so a dropdown opened from inside a drawer/modal renders
 * completely hidden behind that backdrop. Prefer an inline control over a nested overlay.
 */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? dialog)?.focus();

    // Two-phase mount: paint the closed (translated-off-screen) position first, then flip to
    // open on the next frame — otherwise the browser coalesces both states into one frame and
    // the slide-in transition never plays.
    const raf = requestAnimationFrame(() => setVisible(true));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;

      const items = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      setVisible(false);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0" style={{ zIndex: "var(--z-modal)" }}>
        <div
          aria-hidden="true"
          onClick={onClose}
          className={cn(
            "fixed inset-0 bg-neutral-950/50 transition-opacity duration-200 ease-standard",
            visible ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={cn(
            "fixed inset-y-0 right-0 z-10 flex w-full max-w-xs flex-col gap-5 bg-surface p-5 shadow-xl outline-none",
            "transition-transform duration-200 ease-standard",
            visible ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold text-text">
              {title}
            </h2>
            <IconButton
              label="Close menu"
              onClick={onClose}
              icon={
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
            />
          </div>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto">{children}</div>
        </div>
      </div>
    </Portal>
  );
}
