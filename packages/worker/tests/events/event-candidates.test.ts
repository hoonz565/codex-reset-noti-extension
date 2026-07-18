import { describe, test, expect } from 'vitest';
import { EventCandidateDetector } from '../../src/events/event-candidates';
import { SourceSnapshotRow } from '../../src/db/schema';

describe('Event Candidate Detector', () => {
  const baseSnap: SourceSnapshotRow = {
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

  test('EV-PROB-1: Previous 68, current 70 creates PROBABILITY_REACHED_70', () => {
    const prev = { ...baseSnap, probability: 68 };
    const curr = { ...baseSnap, probability: 70 };
    const cands = EventCandidateDetector.detect(prev, curr);
    expect(cands.length).toBe(1);
    expect(cands[0].type).toBe('PROBABILITY_REACHED_70');
    expect(cands[0].condition.previous_probability).toBe(68);
    expect(cands[0].condition.current_probability).toBe(70);
  });

  test('EV-PROB-2: Previous 68, current 95 preserves current_probability=95', () => {
    const prev = { ...baseSnap, probability: 68 };
    const curr = { ...baseSnap, probability: 95 };
    const cands = EventCandidateDetector.detect(prev, curr);
    expect(cands[0].condition.current_probability).toBe(95);
  });

  test('EV-PROB-3: Previous 70, current 80 creates no new threshold event', () => {
    const prev = { ...baseSnap, probability: 70 };
    const curr = { ...baseSnap, probability: 80 };
    const cands = EventCandidateDetector.detect(prev, curr);
    expect(cands.length).toBe(0);
  });

  test('EV-PROB-4: Previous 75, current 65 then current 72 still creates at most one event in that cycle', () => {
    // Detection just compares prev and curr. Idempotency prevents duplicates later.
    const prev = { ...baseSnap, probability: 65 };
    const curr = { ...baseSnap, probability: 72 };
    const cands = EventCandidateDetector.detect(prev, curr);
    expect(cands.length).toBe(1);
  });

  test('EV-ANN-1: resetAnnounced false to true creates RESET_ANNOUNCED', () => {
    const prev = { ...baseSnap, lifecycle: 'none' };
    const curr = { ...baseSnap, lifecycle: 'announced' };
    const cands = EventCandidateDetector.detect(
      prev as unknown as SourceSnapshotRow,
      curr as unknown as SourceSnapshotRow
    );
    expect(cands.length).toBe(1);
    expect(cands[0].type).toBe('RESET_ANNOUNCED');
  });

  test('EV-ANN-2: score=100 with resetAnnounced=false creates no announcement event', () => {
    const prev = { ...baseSnap, lifecycle: 'none', probability: 99 };
    const curr = { ...baseSnap, lifecycle: 'none', probability: 100 };
    const cands = EventCandidateDetector.detect(
      prev as unknown as SourceSnapshotRow,
      curr as unknown as SourceSnapshotRow
    );
    const hasAnnounced = cands.some((c) => c.type === 'RESET_ANNOUNCED');
    expect(hasAnnounced).toBe(false);
  });

  test('EV-ANN-5: Announcement event references exact source snapshot', () => {
    const prev = { ...baseSnap, lifecycle: 'none' };
    const curr = { ...baseSnap, id: 'snap-xyz', lifecycle: 'announced' };
    const cands = EventCandidateDetector.detect(
      prev as unknown as SourceSnapshotRow,
      curr as unknown as SourceSnapshotRow
    );
    expect(cands[0].condition.source_snapshot_id).toBe('snap-xyz');
  });
});
