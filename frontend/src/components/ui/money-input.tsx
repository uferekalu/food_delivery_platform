"use client";

import { forwardRef, useEffect, useState, type ChangeEvent } from "react";
import { cn } from "@/lib/cn";
import { currencySymbol } from "@/lib/currency";
import { useFormFieldContext } from "./form-field";

export interface MoneyInputProps {
  /** The numeric value RHF/the caller owns — `undefined` means "blank," distinguishable from 0
   * (several price fields, e.g. costPrice, treat "left blank" and "explicitly free" differently). */
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  onBlur?: () => void;
  /** ISO 4217 code of the amount being entered — drives the leading symbol shown in the field
   * (e.g. "₦"), not a formatting instruction; the amount itself is grouped using `locale`'s
   * conventions regardless of currency. */
  currencyCode?: string;
  locale: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
}

// Keeps only digits and a single decimal point (capped to 2 fractional digits) — the same
// constraint a native `type="number"` input enforces, just applied by hand since commas need to
// pass through for display and `type="number"` rejects them outright.
function sanitizeDigits(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const intPart = cleaned.slice(0, dot);
  const fracPart = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${intPart}.${fracPart}`;
}

// `BigInt` (not `Number`) for the grouping pass — a plain `Number` on a long in-progress digit
// string risks precision loss or flipping to exponential notation while the user is still
// typing, well before the value is a real, complete price.
function groupInteger(intDigits: string, locale: string): string {
  if (intDigits === "") return "";
  try {
    return new Intl.NumberFormat(locale).format(BigInt(intDigits));
  } catch {
    return intDigits;
  }
}

function formatForDisplay(raw: string, locale: string): string {
  if (raw === "") return "";
  const dot = raw.indexOf(".");
  if (dot === -1) return groupInteger(raw, locale);
  return `${groupInteger(raw.slice(0, dot), locale)}.${raw.slice(dot + 1)}`;
}

/**
 * A price input that live-formats with thousands separators as the user types (e.g. typing
 * "1000" shows "1,000") and shows the relevant currency symbol as a leading adornment — plain
 * `type="number"` inputs can't do the former (commas aren't valid there) and never did the
 * latter. Not `register()`-compatible (RHF needs a real numeric value, not this component's
 * intermediate display string), so every caller wires it up via `Controller`, same as this kit's
 * `Select`.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  {
    value,
    onChange,
    onBlur,
    currencyCode,
    locale,
    placeholder,
    disabled,
    invalid,
    id,
    className,
    "aria-describedby": describedByProp,
    "aria-label": ariaLabel,
  },
  ref,
) {
  const field = useFormFieldContext();
  const inputId = id ?? field?.id;
  const isInvalid = invalid ?? field?.invalid ?? false;
  const describedBy = describedByProp ?? field?.describedBy;

  // The raw digit-string being actively edited (e.g. "12.5"), kept separate from the numeric
  // `value` prop — re-deriving display text from the parsed number on every keystroke would
  // stomp an in-progress trailing "." or "12.50" back down to "12.5".
  const [rawText, setRawText] = useState(() => (value != null ? String(value) : ""));

  // Only re-sync from the outside when `value` changes to something that doesn't match what's
  // currently being typed (form reset, loading an existing item's saved price) — never on every
  // render, which is what would fight the user's own typing.
  useEffect(() => {
    const parsed = rawText === "" || rawText === "." ? undefined : Number(rawText);
    if (value !== parsed) setRawText(value != null ? String(value) : "");
    // Deliberately excludes `rawText` — this effect exists purely to react to external `value`
    // changes, not the local typing state it itself manages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const digits = sanitizeDigits(e.target.value);
    setRawText(digits);
    onChange(digits === "" || digits === "." ? undefined : Number(digits));
  }

  const symbol = currencySymbol(currencyCode, locale);

  return (
    <div className="relative">
      {symbol && (
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-text-muted">
          {symbol}
        </span>
      )}
      <input
        ref={ref}
        id={inputId}
        type="text"
        inputMode="decimal"
        value={formatForDisplay(rawText, locale)}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={isInvalid || undefined}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        className={cn(
          "h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-muted",
          "transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:outline-danger",
          symbol && "pl-8",
          className,
        )}
      />
    </div>
  );
});
