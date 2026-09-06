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

// Statuses where a rider is actively working an order — a rider in one of these already has
// their hands full, so nearest-rider dispatch (docs/ROADMAP.md FDP-98) and the live-location
// broadcast (docs/ROADMAP.md FDP-17) both need this exact set. Single source of truth: both
// call sites import this rather than keeping their own copy, so it can't drift between them.
export const ACTIVE_DELIVERY_STATUSES: OrderStatus[] = [
  'ASSIGNED_TO_RIDER',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
];

export const PAYMENT_STATUSES = [
  'pending',
  'succeeded',
  'failed',
  'refunded',
] as const;
export type OrderPaymentStatus = (typeof PAYMENT_STATUSES)[number];
