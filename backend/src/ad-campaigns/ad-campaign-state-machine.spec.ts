import {
  AD_CAMPAIGN_TRANSITIONS,
  canTransition,
  isTerminal,
} from './ad-campaign-state-machine';
import { AD_CAMPAIGN_STATUSES } from './schemas/ad-campaign.schema';

describe('ad-campaign-state-machine', () => {
  it('every status is a key in the transition graph', () => {
    for (const status of AD_CAMPAIGN_STATUSES) {
      expect(AD_CAMPAIGN_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('canTransition follows the declared graph', () => {
    expect(canTransition('pending_payment', 'scheduled')).toBe(true);
    expect(canTransition('pending_payment', 'active')).toBe(true);
    expect(canTransition('pending_payment', 'cancelled')).toBe(true);
    expect(canTransition('scheduled', 'active')).toBe(true);
    expect(canTransition('scheduled', 'cancelled')).toBe(true);
    expect(canTransition('active', 'ended')).toBe(true);
  });

  it('there is no active -> cancelled edge — a paid, live campaign always runs to its natural end date', () => {
    expect(canTransition('active', 'cancelled')).toBe(false);
  });

  it('ended and cancelled are terminal; every other status is not', () => {
    expect(isTerminal('ended')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('pending_payment')).toBe(false);
    expect(isTerminal('scheduled')).toBe(false);
    expect(isTerminal('active')).toBe(false);
  });

  it('never allows skipping straight from scheduled or ended/cancelled to somewhere invalid', () => {
    expect(canTransition('scheduled', 'ended')).toBe(false);
    expect(canTransition('ended', 'active')).toBe(false);
    expect(canTransition('cancelled', 'active')).toBe(false);
  });
});
