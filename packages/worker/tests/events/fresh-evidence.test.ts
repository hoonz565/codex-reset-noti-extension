import { describe, test, expect } from 'vitest';
import { FreshEvidencePolicy } from '../../src/events/fresh-evidence';
import { SourceSnapshotRow } from '../../src/db/schema';

describe('Fresh Evidence Policy', () => {
  const base: SourceSnapshotRow = {
    id: 'snap-1',
    reset_cycle_id: 'cycle:old',
    probability: 50,
    lifecycle: 'none',
    source_health: 'healthy',
    source_updated_at: '2023-01-01T00:00:00Z',
    checked_at: '2023-01-01T00:00:00Z',
    payload_hash: 'hash',
    meaningful_change: 1,
    created_at: '2023-01-01T00:00:00Z',
  };

  test('EV-FRESH-1: Healthy snapshot is eligible', () => {
    const res = FreshEvidencePolicy.evaluate({ ...base, source_health: 'healthy' });
    expect(res.eligible).toBe(true);
  });

  test('EV-FRESH-2: Degraded trusted snapshot is eligible', () => {
    const res = FreshEvidencePolicy.evaluate({ ...base, source_health: 'degraded' });
    expect(res.eligible).toBe(true);
  });

  test('EV-FRESH-3: Unavailable snapshot with null probability is ineligible', () => {
    const res = FreshEvidencePolicy.evaluate({
      ...base,
      source_health: 'unavailable',
      probability: null,
    });
    expect(res.eligible).toBe(false);
    if (!res.eligible) {
      expect(res.reason).toBe('SOURCE_UNAVAILABLE'); // or MISSING_PROBABILITY depending on order, but prompt wants unavailable rejected.
    }
  });

  test('EV-FRESH-4: Unavailable snapshot preserving numeric probability is ineligible', () => {
    const res = FreshEvidencePolicy.evaluate({
      ...base,
      source_health: 'unavailable',
      probability: 95,
    });
    expect(res.eligible).toBe(false);
    if (!res.eligible) expect(res.reason).toBe('SOURCE_UNAVAILABLE');
  });

  test('EV-FRESH-5: Malformed or incomplete snapshot is ineligible', () => {
    const res = FreshEvidencePolicy.evaluate({ ...base, reset_cycle_id: null });
    expect(res.eligible).toBe(false);
    if (!res.eligible) expect(res.reason).toBe('MISSING_CYCLE');

    const res2 = FreshEvidencePolicy.evaluate({ ...base, probability: null });
    expect(res2.eligible).toBe(false);

    const res3 = FreshEvidencePolicy.evaluate({
      ...base,
      source_health: 'invalid_status',
    } as unknown as SourceSnapshotRow);
    expect(res3.eligible).toBe(false);
    if (!res3.eligible) expect(res3.reason).toBe('INVALID_SNAPSHOT');
  });
});
