"use client";

import { cn } from "@/lib/cn";
import { createContext, useContext, useId, type ReactNode } from "react";

interface RadioGroupContextValue {
  name: string;
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps {
  name?: string;
  value?: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function RadioGroup({ name, value, onChange, label, disabled, className, children }: RadioGroupProps) {
  const generatedName = useId();

  return (
    <RadioGroupContext.Provider value={{ name: name ?? generatedName, value, onChange, disabled }}>
      <div role="radiogroup" aria-label={label} className={cn("flex flex-col gap-2", className)}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

export interface RadioOptionProps {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function RadioOption({ value, label, description, disabled }: RadioOptionProps) {
  const ctx = useContext(RadioGroupContext);
  if (!ctx) throw new Error("RadioOption must be used within a RadioGroup");

  const id = `${ctx.name}-${value}`;
  const checked = ctx.value === value;
  const isDisabled = disabled ?? ctx.disabled;

  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-2 text-sm text-text",
        isDisabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="relative mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border-strong">
        <input
          type="radio"
          id={id}
          name={ctx.name}
          value={value}
          checked={checked}
          disabled={isDisabled}
          onChange={() => ctx.onChange(value)}
          className="peer absolute inset-0 size-4 cursor-pointer appearance-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        <span className="hidden size-2 rounded-full bg-primary peer-checked:block" />
      </span>
      <span className="flex flex-col">
        <span>{label}</span>
        {description && <span className="text-xs text-text-muted">{description}</span>}
      </span>
    </label>
  );
}
