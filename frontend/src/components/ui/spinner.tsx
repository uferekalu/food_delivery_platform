import { cn } from "@/lib/cn";

const sizes = {
  sm: "size-4 border-2",
  md: "size-5 border-2",
  lg: "size-8 border-[3px]",
} as const;

export interface SpinnerProps {
  size?: keyof typeof sizes;
  className?: string;
  label?: string;
}

export function Spinner({ size = "md", className, label = "Loading" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block animate-spin rounded-full border-current border-t-transparent text-current",
        sizes[size],
        className,
      )}
    />
  );
}
