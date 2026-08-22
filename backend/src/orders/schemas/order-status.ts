// docs/ARCHITECTURE.md §3. Only PENDING_PAYMENT is ever set by this phase (FDP-11) — every
// status after it is FDP-13's (orders-realtime) state machine to drive.
export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PLACED',
  'ACCEPTED_BY_RESTAURANT',
  'PREPARING',
  'READY_FOR_PICKUP',
  'ASSIGNED_TO_RIDER',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'succeeded',
  'failed',
  'refunded',
] as const;
export type OrderPaymentStatus = (typeof PAYMENT_STATUSES)[number];
