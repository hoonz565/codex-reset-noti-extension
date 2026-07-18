import { describe, it, expect } from 'vitest';
import {
  SubscriberEventType,
  OperationalEventType,
  ProbabilityReached70Payload,
} from '../src/domain/events';

describe('events types', () => {
  it('SubscriberEventType contains exactly PROBABILITY_REACHED_70 and RESET_ANNOUNCED', () => {
    // Type checking at runtime using a dummy array
    const subscriberEvents: SubscriberEventType[] = ['PROBABILITY_REACHED_70', 'RESET_ANNOUNCED'];

    // Ensure that compiler accepts exactly these types
    expect(subscriberEvents.includes('PROBABILITY_REACHED_70')).toBe(true);
    expect(subscriberEvents.includes('RESET_ANNOUNCED')).toBe(true);

    // @ts-expect-error - Ensure that RESET_COMPLETED is NOT a subscriber event
    const invalidSubscriberEvent: SubscriberEventType = 'RESET_COMPLETED';
    expect(invalidSubscriberEvent).toBe('RESET_COMPLETED');
  });

  it('RESET_COMPLETED is operational, not subscriber-facing', () => {
    const operationalEvents: OperationalEventType[] = ['RESET_COMPLETED'];
    expect(operationalEvents.includes('RESET_COMPLETED')).toBe(true);
  });

  it('Threshold payload preserves threshold=70 and currentProbability=95', () => {
    const payload: ProbabilityReached70Payload = {
      threshold: 70,
      previousProbability: 69,
      currentProbability: 95,
    };

    expect(payload.threshold).toBe(70);
    expect(payload.currentProbability).toBe(95);
  });
});
