import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ className, icon, title, description, action, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center", className)}
      {...props}
    >
      {icon && <div className="text-text-muted" aria-hidden="true">{icon}</div>}
      <div className="flex flex-col gap-1">
        <p className="font-medium text-text">{title}</p>
        {description && <p className="text-sm text-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
