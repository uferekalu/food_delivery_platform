"use client";

import { cn } from "@/lib/cn";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Portal } from "./portal";
import { IconButton } from "./icon-button";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? dialog)?.focus();

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
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: "var(--z-modal)" }}>
        {/*
          No explicit z-index here on purpose: this backdrop and the dialog below are both
          direct children of the wrapper that already owns `var(--z-modal)`, so plain DOM
          order decides their stacking (backdrop painted first = behind). Giving the backdrop
          its own explicit z-index (as `var(--z-modal-backdrop)`, higher than the dialog's
          implicit `auto`) put it ABOVE the dialog instead, silently swallowing every click on
          the dialog's footer buttons — found via a real end-to-end test, not code review.
        */}
        <div aria-hidden="true" onClick={onClose} className="fixed inset-0 bg-neutral-950/50" />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cn(
            "relative z-10 flex max-h-[90vh] w-full flex-col gap-4 rounded-xl bg-surface-raised p-6 shadow-xl outline-none",
            sizeClasses[size],
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className="text-lg font-semibold text-text">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="text-sm text-text-muted">
                  {description}
                </p>
              )}
            </div>
            <IconButton
              label="Close"
              onClick={onClose}
              icon={
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
            />
          </div>
          {children && <div className="overflow-y-auto">{children}</div>}
          {footer && <div className="flex justify-end gap-2 pt-2">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}
