import { cn } from "@/lib/cn";
import NextLink, { type LinkProps as NextLinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

export interface LinkProps
  extends NextLinkProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof NextLinkProps> {
  children: ReactNode;
  underline?: "always" | "hover" | "none";
}

export function Link({ className, underline = "hover", ...props }: LinkProps) {
  return (
    <NextLink
      className={cn(
        "text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        underline === "always" && "underline underline-offset-2",
        underline === "hover" && "hover:underline underline-offset-2",
        className,
      )}
      {...props}
    />
  );
}
