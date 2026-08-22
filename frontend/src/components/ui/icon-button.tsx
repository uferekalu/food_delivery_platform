import { cn } from "@/lib/cn";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { buttonVariants } from "./button";
import type { VariantProps } from "class-variance-authority";

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    Pick<VariantProps<typeof buttonVariants>, "variant"> {
  icon: ReactNode;
  label: string;
  size?: "sm" | "md" | "lg";
}

// `md`/`lg` meet the 44px touch-target guideline for standalone icon actions (modal close,
// hamburger, theme toggle). `sm` stays under that deliberately for dense inline rows (e.g. a
// delete button per menu item) where a 44px target per icon would blow out row height — 36px
// still clears WCAG 2.5.8's 24px AA minimum with real gap-based spacing to the next target.
const sizeClasses = {
  sm: "size-9",
  md: "size-11",
  lg: "size-12",
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "ghost", size = "md", icon, label, ...props }, ref) => {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={cn(buttonVariants({ variant }), "p-0", sizeClasses[size], className)}
        {...props}
      >
        {icon}
      </button>
    );
  },
);
IconButton.displayName = "IconButton";
