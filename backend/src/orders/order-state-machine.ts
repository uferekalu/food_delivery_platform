import type { OrderStatus } from './schemas/order-status';

/**
 * Full lifecycle graph (docs/ARCHITECTURE.md §3/§9). `PENDING_PAYMENT` → `PLACED` is
 * deliberately excluded from `OWNER_TRIGGERABLE_TRANSITIONS` below — that one transition is
 * exclusively driven by a verified payment webhook (FDP-14, "this is what actually moves an
 * order out of PENDING_PAYMENT" per docs/ROADMAP.md), never by an authenticated user action.
 * `READY_FOR_PICKUP` → `ASSIGNED_TO_RIDER` is a claim (`OrdersService.assignToRider`), not a
 * plain transition — it also sets `riderId`, so it isn't in `RIDER_TRIGGERABLE_TRANSITIONS`
 * below either. `ASSIGNED_TO_RIDER`/`PICKED_UP`/`OUT_FOR_DELIVERY` are rider-triggered
 * (`docs/ROADMAP.md` FDP-16). `CANCELLED` → `REFUNDED` (FDP-65) mirrors `DELIVERED` →
 * `REFUNDED` — a payment can still need reversing after a post-payment cancellation, not just
 * after delivery; see `OrdersService.REFUNDABLE_STATUSES`/`PaymentsService.refundOrder`.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PLACED', 'CANCELLED'],
  PLACED: ['ACCEPTED_BY_RESTAURANT', 'CANCELLED'],
  ACCEPTED_BY_RESTAURANT: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['ASSIGNED_TO_RIDER', 'CANCELLED'],
  ASSIGNED_TO_RIDER: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
};

/**
 * The subset of transitions a restaurant owner (or admin) can trigger directly — the "live
 * order queue" actions this phase actually ships a UI for (accept/reject/prepare/ready).
 * Everything else in `ORDER_TRANSITIONS` either belongs to a payment webhook or a future
 * rider ticket, not this endpoint.
 */
export const OWNER_TRIGGERABLE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> =
  {
    PENDING_PAYMENT: [],
    PLACED: ['ACCEPTED_BY_RESTAURANT', 'CANCELLED'],
    ACCEPTED_BY_RESTAURANT: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY_FOR_PICKUP', 'CANCELLED'],
    READY_FOR_PICKUP: [],
    ASSIGNED_TO_RIDER: [],
    PICKED_UP: [],
    OUT_FOR_DELIVERY: [],
    DELIVERED: [],
    CANCELLED: [],
    REFUNDED: [],
  };

/**
 * The subset of transitions the order's assigned rider can trigger directly
 * (`RidersController`/`OrdersService.updateStatusByRider`, `docs/ROADMAP.md` FDP-16). Excludes
 * `READY_FOR_PICKUP` → `ASSIGNED_TO_RIDER` (that's the claim/self-assign action, which also has
 * to set `riderId` — see `OrdersService.assignToRider`) and `DELIVERED` → `REFUNDED` (a
 * post-delivery dispute, not something the rider decides).
 */
export const RIDER_TRIGGERABLE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> =
  {
    PENDING_PAYMENT: [],
    PLACED: [],
    ACCEPTED_BY_RESTAURANT: [],
    PREPARING: [],
    READY_FOR_PICKUP: [],
    ASSIGNED_TO_RIDER: ['PICKED_UP'],
    PICKED_UP: ['OUT_FOR_DELIVERY'],
    OUT_FOR_DELIVERY: ['DELIVERED'],
    DELIVERED: [],
    CANCELLED: [],
    REFUNDED: [],
  };

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canOwnerTransition(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return OWNER_TRIGGERABLE_TRANSITIONS[from].includes(to);
}

export function canRiderTransition(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return RIDER_TRIGGERABLE_TRANSITIONS[from].includes(to);
}

/** Terminal states — nothing can transition out of these except the two graph edges that
 * already exist for `DELIVERED` → `REFUNDED` (a post-delivery dispute). */
export function isTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
}
