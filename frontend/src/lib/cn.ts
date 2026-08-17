import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combines conditional class names and resolves conflicting Tailwind utility classes. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
