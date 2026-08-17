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

const sizeClasses = {
  sm: "size-8",
  md: "size-10",
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
