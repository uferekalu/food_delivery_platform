"use client";

import { cn } from "@/lib/cn";
import Image from "next/image";
import { useState } from "react";

const sizes = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
} as const;

export interface AvatarProps {
  src?: string | null;
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}

function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return initials.toUpperCase();
}

export function Avatar({ src, name, size = "md", className }: AvatarProps) {
  const [errored, setErrored] = useState(false);
  const showImage = src && !errored;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-medium text-brand-700 select-none",
        sizes[size],
        className,
      )}
    >
      {showImage ? (
        <Image
          src={src}
          alt={name}
          fill
          sizes="56px"
          className="object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <>
          <span aria-hidden="true">{initialsFrom(name)}</span>
          <span className="sr-only">{name}</span>
        </>
      )}
    </span>
  );
}
