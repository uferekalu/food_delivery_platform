"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Portal } from "./portal";

export interface TooltipTriggerProps {
  ref: (node: HTMLElement | null) => void;
  "aria-describedby": string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

export interface TooltipProps {
  content: string;
  placement?: "top" | "bottom";
  /** Render-prop so the caller attaches the ref/handlers to their own focusable element. */
  children: (triggerProps: TooltipTriggerProps) => ReactNode;
}

export function Tooltip({ content, children, placement = "top" }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const id = useId();

  const show = () => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({
      top: placement === "top" ? r.top + window.scrollY - 8 : r.bottom + window.scrollY + 8,
      left: r.left + window.scrollX + r.width / 2,
    });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  const triggerProps: TooltipTriggerProps = {
    ref: (node) => {
      anchorRef.current = node;
    },
    "aria-describedby": id,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  };

  return (
    <>
      {/* eslint-disable-next-line react-hooks/refs -- prop-getter pattern: `ref` is only
          attached once the caller spreads triggerProps onto real JSX (`<Button {...props}>`),
          identical in effect to a normal `ref={...}` prop; the lint rule can't see through
          the indirection of a plain function call returning the props object. */}
      {children(triggerProps)}
      {open && rect && (
        <Portal>
          <span
            role="tooltip"
            id={id}
            style={{
              position: "absolute",
              top: rect.top,
              left: rect.left,
              transform: `translate(-50%, ${placement === "top" ? "-100%" : "0"})`,
              zIndex: "var(--z-tooltip)",
            }}
            className="pointer-events-none rounded-md bg-neutral-900 px-2 py-1 text-xs text-neutral-0 shadow-md"
          >
            {content}
          </span>
        </Portal>
      )}
    </>
  );
}
