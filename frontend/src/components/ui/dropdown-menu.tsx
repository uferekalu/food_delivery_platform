"use client";

import { cn } from "@/lib/cn";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Portal } from "./portal";

export interface DropdownMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export interface DropdownTriggerProps {
  ref: (node: HTMLElement | null) => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  onClick: () => void;
}

export interface DropdownMenuProps {
  /** Render-prop so the caller attaches the ref/handlers to their own focusable element. */
  trigger: (triggerProps: DropdownTriggerProps) => ReactNode;
  items: DropdownMenuItem[];
  align?: "start" | "end";
}

export function DropdownMenu({ trigger, items, align = "start" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const id = useId();

  const openMenu = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({
      top: r.bottom + window.scrollY + 4,
      left: align === "end" ? r.right + window.scrollX : r.left + window.scrollX,
    });
    setActiveIndex(items.findIndex((i) => !i.disabled));
    setOpen(true);
  }, [align, items]);

  const closeMenu = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (open) menuRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, closeMenu]);

  const move = (delta: number) => {
    setActiveIndex((current) => {
      let next = current;
      for (let i = 0; i < items.length; i++) {
        next = (next + delta + items.length) % items.length;
        if (!items[next].disabled) return next;
      }
      return current;
    });
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!items[activeIndex]?.disabled) {
          items[activeIndex]?.onSelect();
          closeMenu();
        }
        break;
      case "Escape":
        e.preventDefault();
        closeMenu();
        break;
      case "Tab":
        closeMenu(false);
        break;
    }
  };

  const triggerProps: DropdownTriggerProps = {
    ref: (node) => {
      triggerRef.current = node;
    },
    "aria-haspopup": "menu",
    "aria-expanded": open,
    onClick: () => (open ? closeMenu() : openMenu()),
  };

  return (
    <>
      {/* eslint-disable-next-line react-hooks/refs -- prop-getter pattern: `ref` is only
          attached once the caller spreads triggerProps onto real JSX (`<Button {...props}>`),
          identical in effect to a normal `ref={...}` prop; the lint rule can't see through
          the indirection of a plain function call returning the props object. */}
      {trigger(triggerProps)}
      {open && rect && (
        <Portal>
          <ul
            ref={menuRef}
            id={id}
            role="menu"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            style={{ position: "absolute", top: rect.top, left: rect.left, zIndex: "var(--z-dropdown)" }}
            className={cn(
              "min-w-40 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg outline-none",
              align === "end" && "-translate-x-full",
            )}
          >
            {items.map((item, index) => (
              <li
                key={item.label}
                role="menuitem"
                aria-disabled={item.disabled}
                onMouseEnter={() => !item.disabled && setActiveIndex(index)}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect();
                  closeMenu();
                }}
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm",
                  item.destructive ? "text-danger" : "text-text",
                  index === activeIndex && (item.destructive ? "bg-danger-bg" : "bg-neutral-100"),
                  item.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                {item.label}
              </li>
            ))}
          </ul>
        </Portal>
      )}
    </>
  );
}
