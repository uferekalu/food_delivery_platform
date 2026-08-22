"use client";

import { cn } from "@/lib/cn";
import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { useFormFieldContext } from "./form-field";
import { IconButton } from "./icon-button";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <path
        d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <path
        d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, id, invalid, type, "aria-describedby": describedBy, ...props }, ref) => {
    const field = useFormFieldContext();
    // Only `type="password"` fields grow a reveal toggle — every other input type passes
    // straight through unchanged, so this never affects non-password inputs' markup/behavior.
    const isPassword = type === "password";
    const [revealed, setRevealed] = useState(false);

    const input = (
      <input
        ref={ref}
        type={isPassword ? (revealed ? "text" : "password") : type}
        id={id ?? field?.id}
        aria-describedby={describedBy ?? field?.describedBy}
        aria-invalid={invalid ?? field?.invalid ?? undefined}
        className={cn(
          "h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-muted",
          "transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:outline-danger",
          isPassword && "pr-9",
          className,
        )}
        {...props}
      />
    );

    if (!isPassword) return input;

    return (
      <div className="relative">
        {input}
        <IconButton
          type="button"
          label={revealed ? "Hide password" : "Show password"}
          onClick={() => setRevealed((r) => !r)}
          icon={revealed ? <EyeOffIcon /> : <EyeIcon />}
          size="sm"
          className="absolute top-1/2 right-0.5 -translate-y-1/2"
        />
      </div>
    );
  },
);
Input.displayName = "Input";
