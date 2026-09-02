"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export interface RatingProps {
  /** 0-5. Read-only display rounds to the nearest whole star; interactive mode only ever
   * reports whole-star values via onChange. */
  value: number;
  /** Presence makes the component an interactive star-picker instead of a read-only display. */
  onChange?: (value: number) => void;
  /** Accessible name for the group — required when interactive, used as the read-only
   * `aria-label` prefix otherwise. */
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<RatingProps["size"]>, string> = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    >
      <path d="M10 1.5l2.59 5.25 5.79.84-4.19 4.08.99 5.77L10 14.77l-5.18 2.67.99-5.77L1.62 7.59l5.79-.84L10 1.5z" />
    </svg>
  );
}

/** Read-only star display — used on restaurant cards/detail, rider dashboards, review lists. */
export function Rating({ value, onChange, label, size = "md", className }: RatingProps) {
  const t = useTranslations("Common");
  const name = useId();
  const [hovered, setHovered] = useState<number | null>(null);
  const interactive = !!onChange;
  const starClass = cn(SIZE_CLASSES[size], "text-warning");

  if (!interactive) {
    return (
      <div
        className={cn("inline-flex items-center gap-0.5", className)}
        role="img"
        aria-label={`${label ? `${label}: ` : ""}${t("outOfFiveStars", { value: value.toFixed(1) })}`}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <StarIcon key={n} filled={n <= Math.round(value)} className={starClass} />
        ))}
      </div>
    );
  }

  const displayValue = hovered ?? value;

  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const id = `${name}-${n}`;
        return (
          <label key={n} htmlFor={id} className="cursor-pointer p-0.5" onMouseEnter={() => setHovered(n)}>
            <input
              type="radio"
              id={id}
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="peer sr-only"
              aria-label={`${label ? `${label}: ` : ""}${t("starCount", { count: n })}`}
            />
            <StarIcon
              filled={n <= displayValue}
              className={cn(starClass, "rounded peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary")}
            />
          </label>
        );
      })}
    </div>
  );
}
