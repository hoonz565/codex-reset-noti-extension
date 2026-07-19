import { describe, it, expect } from 'vitest';
import { PublicResetStatusSchema } from '../src/status-schema';

describe('PublicResetStatusSchema', () => {
  it('validates empty state correctly', () => {
    const data = {
      state: 'empty',
      probability: null,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: null,
    };
    expect(PublicResetStatusSchema.parse(data)).toEqual(data);
  });

  it('validates fresh state correctly', () => {
    const data = {
      state: 'fresh',
      probability: 75,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: true,
      latestResetAt: '2023-01-01T00:00:00Z',
      resetCycleId: 'cycle:123',
      checkedAt: '2023-01-01T00:00:00Z',
    };
    expect(PublicResetStatusSchema.parse(data)).toEqual(data);
  });

  it('validates stale state correctly', () => {
    const data = {
      state: 'stale',
      probability: 75,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: '2023-01-01T00:00:00Z',
    };
    expect(PublicResetStatusSchema.parse(data)).toEqual(data);
  });

  it('validates unavailable state correctly', () => {
    const data = {
      state: 'unavailable',
      probability: null,
      lastKnownProbability: 75,
      lastKnownObservedAt: '2023-01-01T00:00:00Z',
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: '2023-01-01T00:00:00Z',
    };
    expect(PublicResetStatusSchema.parse(data)).toEqual(data);
  });

  it('rejects invalid combinations', () => {
    const data = {
      state: 'fresh',
      probability: null, // invalid for fresh
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: '2023-01-01T00:00:00Z',
    };
    expect(() => PublicResetStatusSchema.parse(data)).toThrow();
  });
});
