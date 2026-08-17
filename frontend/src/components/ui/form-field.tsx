"use client";

import { cn } from "@/lib/cn";
import { createContext, useContext, useId, type ReactNode } from "react";
import { Label } from "./label";

interface FormFieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

/** Read by Input/Textarea/Select/Checkbox/RadioGroup to auto-wire id + aria-describedby + aria-invalid. */
export function useFormFieldContext() {
  return useContext(FormFieldContext);
}

export interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function FormField({ label, hint, error, required, className, children }: FormFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FormFieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
        {children}
        {error ? (
          <p id={errorId} role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-xs text-text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </FormFieldContext.Provider>
  );
}
