import { cn } from "@/lib/cn";
import { forwardRef, type InputHTMLAttributes } from "react";
import { useFormFieldContext } from "./form-field";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, id, invalid, "aria-describedby": describedBy, ...props }, ref) => {
    const field = useFormFieldContext();

    return (
      <input
        ref={ref}
        id={id ?? field?.id}
        aria-describedby={describedBy ?? field?.describedBy}
        aria-invalid={invalid ?? field?.invalid ?? undefined}
        className={cn(
          "h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-muted",
          "transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:outline-danger",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
