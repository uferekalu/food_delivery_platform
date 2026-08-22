import { randomBytes } from 'crypto';

/** Human-readable, not globally-sequential (no shared counter document to contend on) — a
 * timestamp component plus a short random suffix keeps collisions effectively impossible
 * without needing a dedicated sequence collection. */
export function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${timestamp}-${suffix}`;
}
