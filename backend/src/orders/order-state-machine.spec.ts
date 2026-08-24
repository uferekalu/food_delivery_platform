import {
  canOwnerTransition,
  canRiderTransition,
  canTransition,
  isTerminal,
  ORDER_TRANSITIONS,
} from './order-state-machine';
import { ORDER_STATUSES } from './schemas/order-status';

describe('order-state-machine', () => {
  it('every status is a key in the transition graph', () => {
    for (const status of ORDER_STATUSES) {
      expect(ORDER_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('canTransition follows the declared graph', () => {
    expect(canTransition('PLACED', 'ACCEPTED_BY_RESTAURANT')).toBe(true);
    expect(canTransition('PLACED', 'DELIVERED')).toBe(false);
    expect(canTransition('PENDING_PAYMENT', 'PLACED')).toBe(true);
  });

  it('CANCELLED and REFUNDED are terminal', () => {
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('REFUNDED')).toBe(true);
    expect(isTerminal('PLACED')).toBe(false);
  });

  it('canOwnerTransition never allows PENDING_PAYMENT→PLACED — that stays payment-webhook-only', () => {
    expect(canOwnerTransition('PENDING_PAYMENT', 'PLACED')).toBe(false);
  });

  it('canOwnerTransition allows exactly accept/reject/prepare/ready', () => {
    expect(canOwnerTransition('PLACED', 'ACCEPTED_BY_RESTAURANT')).toBe(true);
    expect(canOwnerTransition('PLACED', 'CANCELLED')).toBe(true);
    expect(canOwnerTransition('ACCEPTED_BY_RESTAURANT', 'PREPARING')).toBe(
      true,
    );
    expect(canOwnerTransition('PREPARING', 'READY_FOR_PICKUP')).toBe(true);
  });

  it('canOwnerTransition never allows rider-stage transitions — those are rider-only', () => {
    expect(canOwnerTransition('READY_FOR_PICKUP', 'ASSIGNED_TO_RIDER')).toBe(
      false,
    );
    expect(canOwnerTransition('ASSIGNED_TO_RIDER', 'PICKED_UP')).toBe(false);
    expect(canOwnerTransition('PICKED_UP', 'OUT_FOR_DELIVERY')).toBe(false);
  });

  it('every owner-triggerable transition is also a valid graph edge', () => {
    for (const status of ORDER_STATUSES) {
      for (const target of ORDER_TRANSITIONS[status]) {
        if (canOwnerTransition(status, target)) {
          expect(canTransition(status, target)).toBe(true);
        }
      }
    }
  });

  it('canRiderTransition allows exactly picked-up/out-for-delivery/delivered', () => {
    expect(canRiderTransition('ASSIGNED_TO_RIDER', 'PICKED_UP')).toBe(true);
    expect(canRiderTransition('PICKED_UP', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(canRiderTransition('OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true);
  });

  it('canRiderTransition never allows the claim step or owner/payment transitions', () => {
    expect(canRiderTransition('READY_FOR_PICKUP', 'ASSIGNED_TO_RIDER')).toBe(
      false,
    ); // that's OrdersService.assignToRider, not a plain transition
    expect(canRiderTransition('PLACED', 'ACCEPTED_BY_RESTAURANT')).toBe(
      false,
    );
    expect(canRiderTransition('PENDING_PAYMENT', 'PLACED')).toBe(false);
    expect(canRiderTransition('DELIVERED', 'REFUNDED')).toBe(false);
  });

  it('every rider-triggerable transition is also a valid graph edge', () => {
    for (const status of ORDER_STATUSES) {
      for (const target of ORDER_TRANSITIONS[status]) {
        if (canRiderTransition(status, target)) {
          expect(canTransition(status, target)).toBe(true);
        }
      }
    }
  });
});
