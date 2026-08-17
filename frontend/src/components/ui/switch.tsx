"use client";

import { cn } from "@/lib/cn";
import { forwardRef, type ButtonHTMLAttributes } from "react";

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hideLabel?: boolean;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onChange, label, hideLabel, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={hideLabel ? label : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150",
          checked ? "bg-primary" : "bg-neutral-300",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-4 transform rounded-full bg-neutral-0 shadow-sm transition-transform duration-150",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
        {!hideLabel && <span className="sr-only">{label}</span>}
      </button>
    );
  },
);
Switch.displayName = "Switch";
