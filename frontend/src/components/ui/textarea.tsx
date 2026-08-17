import { cn } from "@/lib/cn";
import { forwardRef, type TextareaHTMLAttributes } from "react";
import { useFormFieldContext } from "./form-field";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, id, invalid, rows = 4, "aria-describedby": describedBy, ...props }, ref) => {
    const field = useFormFieldContext();

    return (
      <textarea
        ref={ref}
        id={id ?? field?.id}
        rows={rows}
        aria-describedby={describedBy ?? field?.describedBy}
        aria-invalid={invalid ?? field?.invalid ?? undefined}
        className={cn(
          "w-full resize-y rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted",
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
Textarea.displayName = "Textarea";
