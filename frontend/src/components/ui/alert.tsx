import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

const alertVariants = cva("flex gap-3 rounded-lg border p-4 text-sm", {
  variants: {
    variant: {
      neutral: "border-border bg-surface-subtle text-text",
      success: "border-success/20 bg-success-bg text-success",
      warning: "border-warning/20 bg-warning-bg text-warning",
      danger: "border-danger/20 bg-danger-bg text-danger",
      info: "border-info/20 bg-info-bg text-info",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface AlertProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  title?: string;
  icon?: ReactNode;
}

export function Alert({ className, variant, title, icon, children, ...props }: AlertProps) {
  return (
    <div role={variant === "danger" || variant === "warning" ? "alert" : "status"} className={cn(alertVariants({ variant }), className)} {...props}>
      {icon && <span className="mt-0.5 shrink-0" aria-hidden="true">{icon}</span>}
      <div className="flex flex-col gap-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-text/90">{children}</div>}
      </div>
    </div>
  );
}
