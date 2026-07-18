import { describe, it, expect } from 'vitest';
import { isSubscriberEligibleForEvent } from '../../src/delivery/delivery-eligibility';
import { Subscriber } from '../../src/db/schema';

describe('Delivery Eligibility', () => {
  const baseSub: Subscriber = {
    id: 'sub1',
    email: 'test@example.com',
    state: 'active',
    preferences: { probability70: true, resetAnnounced: true },
    managementTokenHash: 'hash',
    createdAt: new Date().toISOString(),
  };

  it('DEL-ELIG-1: Active subscriber with probability70 enabled is eligible for PROBABILITY_REACHED_70', () => {
    expect(isSubscriberEligibleForEvent(baseSub, 'PROBABILITY_REACHED_70')).toBe(true);
  });

  it('DEL-ELIG-2: Active subscriber with probability70 disabled is ineligible', () => {
    const sub = { ...baseSub, preferences: { ...baseSub.preferences, probability70: false } };
    expect(isSubscriberEligibleForEvent(sub, 'PROBABILITY_REACHED_70')).toBe(false);
  });

  it('DEL-ELIG-3: Active subscriber with resetAnnounced enabled is eligible for RESET_ANNOUNCED', () => {
    expect(isSubscriberEligibleForEvent(baseSub, 'RESET_ANNOUNCED')).toBe(true);
  });

  it('DEL-ELIG-4: Unsubscribed subscriber is ineligible', () => {
    const sub: Subscriber = { ...baseSub, state: 'unsubscribed' };
    expect(isSubscriberEligibleForEvent(sub, 'PROBABILITY_REACHED_70')).toBe(false);
  });

  it('DEL-ELIG-5: Suppressed subscriber is ineligible', () => {
    const sub: Subscriber = { ...baseSub, state: 'suppressed' };
    expect(isSubscriberEligibleForEvent(sub, 'PROBABILITY_REACHED_70')).toBe(false);
  });

  it('DEL-ELIG-6: RESET_COMPLETED is never eligible', () => {
    // We cast since the type system blocks passing OperationalEventType to the domain function
    expect(isSubscriberEligibleForEvent(baseSub, 'RESET_COMPLETED' as SubscriberEventType)).toBe(
      false
    );
  });

  it('DEL-ELIG-7: Unknown event type is rejected', () => {
    expect(isSubscriberEligibleForEvent(baseSub, 'SOME_UNKNOWN' as SubscriberEventType)).toBe(
      false
    );
  });
});
