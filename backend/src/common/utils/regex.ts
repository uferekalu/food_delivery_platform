/** Escapes regex metacharacters so user-supplied search input is always treated as a literal
 * substring, never interpreted as a pattern (prevents both wrong matches like `.` matching any
 * character, and ReDoS from pathological input). */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
