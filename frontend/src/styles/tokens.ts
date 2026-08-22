/**
 * Typed accessor for the design tokens defined in `src/styles/tokens.css`.
 * These are `var(--x)` references, not duplicated literal values — the CSS
 * file is the only place a literal color/radius/shadow value lives, so
 * there is nothing here that can drift out of sync with it.
 *
 * Use Tailwind utility classes (e.g. `bg-primary`, `text-text-muted`,
 * `rounded-lg`) in components wherever possible. Reach for this module only
 * when a token value is needed outside Tailwind's class system — e.g. an
 * inline style passed to a third-party component (Mapbox marker styling).
 */

export const brand = {
  50: "var(--color-brand-50)",
  100: "var(--color-brand-100)",
  200: "var(--color-brand-200)",
  300: "var(--color-brand-300)",
  400: "var(--color-brand-400)",
  500: "var(--color-brand-500)",
  600: "var(--color-brand-600)",
  700: "var(--color-brand-700)",
  800: "var(--color-brand-800)",
  900: "var(--color-brand-900)",
  950: "var(--color-brand-950)",
} as const;

export const neutral = {
  0: "var(--color-neutral-0)",
  50: "var(--color-neutral-50)",
  100: "var(--color-neutral-100)",
  200: "var(--color-neutral-200)",
  300: "var(--color-neutral-300)",
  400: "var(--color-neutral-400)",
  500: "var(--color-neutral-500)",
  600: "var(--color-neutral-600)",
  700: "var(--color-neutral-700)",
  800: "var(--color-neutral-800)",
  900: "var(--color-neutral-900)",
  950: "var(--color-neutral-950)",
} as const;

export const semantic = {
  primary: "var(--color-primary)",
  primaryHover: "var(--color-primary-hover)",
  primaryActive: "var(--color-primary-active)",
  primarySubtle: "var(--color-primary-subtle)",
  primaryForeground: "var(--color-primary-foreground)",
  surface: "var(--color-surface)",
  surfaceSubtle: "var(--color-surface-subtle)",
  surfaceRaised: "var(--color-surface-raised)",
  secondary: "var(--color-secondary)",
  secondaryHover: "var(--color-secondary-hover)",
  secondaryActive: "var(--color-secondary-active)",
  border: "var(--color-border)",
  borderStrong: "var(--color-border-strong)",
  text: "var(--color-text)",
  textMuted: "var(--color-text-muted)",
  textOnPrimary: "var(--color-text-on-primary)",
  textDisabled: "var(--color-text-disabled)",
  success: "var(--color-success)",
  successBg: "var(--color-success-bg)",
  warning: "var(--color-warning)",
  warningBg: "var(--color-warning-bg)",
  danger: "var(--color-danger)",
  dangerBg: "var(--color-danger-bg)",
  info: "var(--color-info)",
  infoBg: "var(--color-info-bg)",
} as const;

export const radius = {
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  "2xl": "var(--radius-2xl)",
  full: "var(--radius-full)",
} as const;

export const shadow = {
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
  xl: "var(--shadow-xl)",
} as const;

export const zIndex = {
  dropdown: "var(--z-dropdown)",
  sticky: "var(--z-sticky)",
  modalBackdrop: "var(--z-modal-backdrop)",
  modal: "var(--z-modal)",
  toast: "var(--z-toast)",
  tooltip: "var(--z-tooltip)",
} as const;

export const duration = {
  fast: "var(--duration-fast)",
  base: "var(--duration-base)",
  slow: "var(--duration-slow)",
} as const;

export const fontFamily = {
  sans: "var(--font-sans)",
} as const;

/**
 * Resolves a `var(--x)` token string to its computed literal value in the
 * browser. For contexts that can't consume CSS custom properties directly
 * (e.g. some chart/canvas APIs). No-op (returns the input) during SSR.
 */
export function resolveToken(token: string): string {
  if (typeof window === "undefined") return token;
  const match = /var\((--[\w-]+)\)/.exec(token);
  if (!match) return token;
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
}
