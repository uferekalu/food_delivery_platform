"use client";

import { cn } from "@/lib/cn";
import { forwardRef, type InputHTMLAttributes } from "react";
import { useFormFieldContext } from "./form-field";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, id, label, "aria-describedby": describedBy, ...props }, ref) => {
    const field = useFormFieldContext();
    const inputId = id ?? field?.id;

    const input = (
      <input
        ref={ref}
        type="checkbox"
        id={inputId}
        aria-describedby={describedBy ?? field?.describedBy}
        className={cn(
          "peer size-4 shrink-0 appearance-none rounded border border-border-strong bg-surface",
          "checked:border-primary checked:bg-primary",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );

    if (!label) return input;

    return (
      <label htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-2 text-sm text-text">
        <span className="relative inline-flex">
          {input}
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            className="pointer-events-none absolute inset-0 hidden size-4 stroke-neutral-0 peer-checked:block"
          >
            <path d="M3.5 8.5L6.5 11.5L12.5 4.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {label}
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";
