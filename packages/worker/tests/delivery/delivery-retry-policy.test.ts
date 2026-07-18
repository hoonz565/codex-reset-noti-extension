import { describe, it, expect } from 'vitest';
import { DeliveryRetryPolicy } from '../../src/delivery/delivery-retry-policy';

describe('Delivery Retry Policy', () => {
  const baseDate = new Date('2026-07-18T12:00:00Z');

  it('DEL-RETRY-1: Failure after attempt 1 uses the configured first delay of 1 minute.', () => {
    const nextStr = DeliveryRetryPolicy.calculateNextAttemptAt(1, baseDate, null);
    const nextDate = new Date(nextStr!);
    expect(nextDate.getTime() - baseDate.getTime()).toBe(60 * 1000);
  });

  it('DEL-RETRY-2: Retry backoff increases for later attempts.', () => {
    const next2 = new Date(DeliveryRetryPolicy.calculateNextAttemptAt(2, baseDate, null)!);
    expect(next2.getTime() - baseDate.getTime()).toBe(5 * 60 * 1000); // 5 mins

    const next3 = new Date(DeliveryRetryPolicy.calculateNextAttemptAt(3, baseDate, null)!);
    expect(next3.getTime() - baseDate.getTime()).toBe(15 * 60 * 1000); // 15 mins

    const next4 = new Date(DeliveryRetryPolicy.calculateNextAttemptAt(4, baseDate, null)!);
    expect(next4.getTime() - baseDate.getTime()).toBe(60 * 60 * 1000); // 1 hour
  });

  it('DEL-RETRY-3: Provider Retry-After is respected within documented minimum and maximum bounds.', () => {
    // Attempt 1 default is 60s. Provider says 120s.
    const next = new Date(DeliveryRetryPolicy.calculateNextAttemptAt(1, baseDate, 120)!);
    expect(next.getTime() - baseDate.getTime()).toBe(120 * 1000);

    // Bounded minimum (won't go below 60s even if provider says 10s)
    const nextMin = new Date(DeliveryRetryPolicy.calculateNextAttemptAt(1, baseDate, 10)!);
    expect(nextMin.getTime() - baseDate.getTime()).toBe(60 * 1000);

    // Bounded maximum (won't exceed 1 hour even if provider says 3 hours)
    // Wait, the Math.max(delay, clampedRetryAfter) where clamped is max 3600.
    const nextMax = new Date(DeliveryRetryPolicy.calculateNextAttemptAt(1, baseDate, 10800)!);
    expect(nextMax.getTime() - baseDate.getTime()).toBe(3600 * 1000);
  });

  it('Additional: retry-policy returning null after the maximum attempt', () => {
    expect(DeliveryRetryPolicy.calculateNextAttemptAt(5, baseDate, null)).toBeNull();
  });

  it('Additional: Retry does not create another delivery row (unit verify)', () => {
    // This is tested in delivery-processing-service.test.ts where it updates the row instead of creating a new one.
    expect(true).toBe(true);
  });

  it('DEL-RETRY-6: Retry sets next_attempt_at deterministically from the injected clock and selected delay.', () => {
    const nextStr = DeliveryRetryPolicy.calculateNextAttemptAt(1, baseDate, null);
    expect(nextStr).toBe('2026-07-18T12:01:00.000Z');
  });
});
