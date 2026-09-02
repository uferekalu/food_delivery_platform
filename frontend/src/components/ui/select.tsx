"use client";

import { cn } from "@/lib/cn";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslations } from "next-intl";
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
  /** Adds a type-to-filter search box at the top of the open list — for a list long enough that
   * scrolling to find an option is the actual bottleneck (countries, currencies, banks), not a
   * handful of choices where it'd just be noise. Replaces single-character typeahead, which
   * exists for exactly the same reason on a short list. */
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  invalid,
  id,
  className,
  "aria-describedby": describedByProp,
  "aria-label": ariaLabel,
  searchable = false,
  searchPlaceholder,
}: SelectProps) {
  const t = useTranslations("Common");
  const effectivePlaceholder = placeholder ?? t("selectPlaceholder");
  const effectiveSearchPlaceholder = searchPlaceholder ?? t("searchPlaceholder");
  const field = useFormFieldContext();
  const selectId = id ?? field?.id;
  const describedBy = describedByProp ?? field?.describedBy;
  const isInvalid = invalid ?? field?.invalid ?? false;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rawActiveIndex, setActiveIndex] = useState(-1);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const typeaheadRef = useRef("");
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  // Only ever narrows `options` — the trigger's own label lookup above always reads the full
  // list, so a selected value never "disappears" from view just because a search is active.
  const visibleOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, searchable, query]);

  // Derived, not synchronized via an effect: a search narrowing the list can easily leave
  // rawActiveIndex pointing at nothing (or a now-hidden option) — falling back to the first
  // enabled visible option is a pure function of the current list, computed at render time
  // rather than corrected a tick later by a setState-in-effect.
  const activeIndex = useMemo(() => {
    if (rawActiveIndex >= 0 && !visibleOptions[rawActiveIndex]?.disabled) return rawActiveIndex;
    return visibleOptions.findIndex((o) => !o.disabled);
  }, [rawActiveIndex, visibleOptions]);

  const openList = useCallback(() => {
    if (disabled) return;
    const trigger = triggerRef.current;
    if (trigger) {
      const r = trigger.getBoundingClientRect();
      setRect({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
    }
    setQuery("");
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
    if (searchable) searchInputRef.current?.focus();
    else listRef.current?.focus();
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || containerRef.current?.contains(target)) return;
      closeList(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, closeList]);

  const commit = (index: number) => {
    const option = visibleOptions[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    closeList();
  };

  // Steps from the derived `activeIndex` (what's actually highlighted right now), not the raw
  // stored index — the two can diverge right after a search narrows the list, and stepping from
  // a stale raw index would move relative to an item that's no longer even visible.
  const moveActive = (delta: number) => {
    if (visibleOptions.length === 0) return;
    let next = activeIndex;
    for (let i = 0; i < visibleOptions.length; i++) {
      next = (next + delta + visibleOptions.length) % visibleOptions.length;
      if (!visibleOptions[next].disabled) break;
    }
    setActiveIndex(next);
  };

  function handleNavigationKeyDown(e: ReactKeyboardEvent): boolean {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveActive(1);
        return true;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1);
        return true;
      case "Home":
        e.preventDefault();
        setActiveIndex(visibleOptions.findIndex((o) => !o.disabled));
        return true;
      case "End":
        e.preventDefault();
        for (let i = visibleOptions.length - 1; i >= 0; i--) {
          if (!visibleOptions[i].disabled) {
            setActiveIndex(i);
            break;
          }
        }
        return true;
      case "Enter":
        e.preventDefault();
        commit(activeIndex);
        return true;
      case "Escape":
        e.preventDefault();
        closeList();
        return true;
      case "Tab":
        closeList(false);
        return true;
      default:
        return false;
    }
  }

  const handleListKeyDown = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    if (handleNavigationKeyDown(e)) return;
    if (e.key === " ") {
      e.preventDefault();
      commit(activeIndex);
      return;
    }
    if (e.key.length === 1) {
      window.clearTimeout(typeaheadTimer.current);
      typeaheadRef.current += e.key.toLowerCase();
      const match = visibleOptions.findIndex(
        (o) => !o.disabled && o.label.toLowerCase().startsWith(typeaheadRef.current),
      );
      if (match >= 0) setActiveIndex(match);
      typeaheadTimer.current = setTimeout(() => {
        typeaheadRef.current = "";
      }, 500);
    }
  };

  const handleSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    handleNavigationKeyDown(e);
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value);

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
        <span className="truncate">{selected ? selected.label : effectivePlaceholder}</span>
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="ml-2 size-4 shrink-0 text-text-muted">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && rect && (
        <Portal>
          <div
            ref={containerRef}
            style={{ position: "absolute", top: rect.top, left: rect.left, width: rect.width, zIndex: "var(--z-dropdown)" }}
            className="overflow-hidden rounded-md border border-border bg-surface-raised shadow-lg"
          >
            {searchable && (
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder={effectiveSearchPlaceholder}
                aria-label={effectiveSearchPlaceholder}
                aria-controls={`${selectId}-listbox`}
                aria-activedescendant={activeId}
                className="w-full border-b border-border bg-transparent px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none"
              />
            )}
            <ul
              ref={listRef}
              id={`${selectId}-listbox`}
              role="listbox"
              tabIndex={searchable ? -1 : 0}
              aria-activedescendant={activeId}
              aria-labelledby={selectId}
              onKeyDown={searchable ? undefined : handleListKeyDown}
              className="max-h-64 overflow-auto py-1 outline-none"
            >
              {visibleOptions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-text-muted">No matches</li>
              ) : (
                visibleOptions.map((option, index) => (
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
                ))
              )}
            </ul>
          </div>
        </Portal>
      )}
    </>
  );
}
