"use client";

import { cn } from "@/lib/cn";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Portal } from "./portal";
import { useFormFieldContext } from "./form-field";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  invalid,
  id,
  className,
  "aria-describedby": describedByProp,
  "aria-label": ariaLabel,
}: SelectProps) {
  const field = useFormFieldContext();
  const selectId = id ?? field?.id;
  const describedBy = describedByProp ?? field?.describedBy;
  const isInvalid = invalid ?? field?.invalid ?? false;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeaheadRef = useRef("");
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const openList = useCallback(() => {
    if (disabled) return;
    const trigger = triggerRef.current;
    if (trigger) {
      const r = trigger.getBoundingClientRect();
      setRect({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
    }
    const initialIndex = options.findIndex((o) => o.value === value);
    setActiveIndex(initialIndex >= 0 ? initialIndex : options.findIndex((o) => !o.disabled));
    setOpen(true);
  }, [disabled, options, value]);

  const closeList = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      closeList(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, closeList]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    closeList();
  };

  const moveActive = (delta: number) => {
    setActiveIndex((current) => {
      let next = current;
      for (let i = 0; i < options.length; i++) {
        next = (next + delta + options.length) % options.length;
        if (!options[next].disabled) return next;
      }
      return current;
    });
  };

  const handleListKeyDown = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(options.findIndex((o) => !o.disabled));
        break;
      case "End":
        e.preventDefault();
        for (let i = options.length - 1; i >= 0; i--) {
          if (!options[i].disabled) {
            setActiveIndex(i);
            break;
          }
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        closeList();
        break;
      case "Tab":
        closeList(false);
        break;
      default:
        if (e.key.length === 1) {
          window.clearTimeout(typeaheadTimer.current);
          typeaheadRef.current += e.key.toLowerCase();
          const match = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(typeaheadRef.current));
          if (match >= 0) setActiveIndex(match);
          typeaheadTimer.current = setTimeout(() => {
            typeaheadRef.current = "";
          }, 500);
        }
    }
  };

  const activeId = activeIndex >= 0 ? `${selectId}-option-${activeIndex}` : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={selectId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        onClick={() => (open ? closeList() : openList())}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-border-strong bg-surface px-3 text-sm text-text",
          "transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isInvalid && "border-danger",
          !selected && "text-text-muted",
          className,
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="ml-2 size-4 shrink-0 text-text-muted">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && rect && (
        <Portal>
          <ul
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={activeId}
            aria-labelledby={selectId}
            onKeyDown={handleListKeyDown}
            style={{ position: "absolute", top: rect.top, left: rect.left, width: rect.width, zIndex: "var(--z-dropdown)" }}
            className="max-h-64 overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg outline-none"
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${selectId}-option-${index}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onClick={() => commit(index)}
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm text-text",
                  index === activeIndex && "bg-primary-subtle",
                  option.value === value && "font-medium",
                  option.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                {option.label}
              </li>
            ))}
          </ul>
        </Portal>
      )}
    </>
  );
}
