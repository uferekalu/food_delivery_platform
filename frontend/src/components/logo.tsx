export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="9" fill="var(--color-primary)" />
      <path
        d="M11 8v5a2 2 0 0 0 2 2v9M11 8v4M13.5 8v4M16 8v4a2 2 0 0 1-2 2"
        stroke="var(--color-primary-foreground)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 8c-1.8 0-3 1.6-3 3.5S19.6 15 21 15v9"
        stroke="var(--color-primary-foreground)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
