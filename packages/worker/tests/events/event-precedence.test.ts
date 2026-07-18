import { describe, test, expect } from 'vitest';
import { EventPrecedenceResolver } from '../../src/events/event-precedence';

describe('Event Precedence Resolver', () => {
  const ts = new Date('2023-01-01T00:00:00Z');
  const probCand = {
    type: 'PROBABILITY_REACHED_70' as const,
    condition: {
      threshold: 70,
      previous_probability: 60,
      current_probability: 75,
      source_snapshot_id: '1',
    },
  };
  const annCand = {
    type: 'RESET_ANNOUNCED' as const,
    condition: {
      threshold: null,
      previous_probability: 60,
      current_probability: 75,
      source_snapshot_id: '1',
    },
  };

  test('EV-PREC-1: Probability crossing only creates probability event', () => {
    const res = EventPrecedenceResolver.resolve('cycle:1', 'snap:1', [probCand], ts);
    expect(res.winningCandidate?.type).toBe('PROBABILITY_REACHED_70');
    expect(res.suppressionAudit).toBeNull();
  });

  test('EV-PREC-2: Announcement only creates announcement event', () => {
    const res = EventPrecedenceResolver.resolve('cycle:1', 'snap:1', [annCand], ts);
    expect(res.winningCandidate?.type).toBe('RESET_ANNOUNCED');
    expect(res.suppressionAudit).toBeNull();
  });

  test('EV-PREC-3: Both candidates together persist only RESET_ANNOUNCED', () => {
    const res = EventPrecedenceResolver.resolve('cycle:1', 'snap:1', [annCand, probCand], ts);
    expect(res.winningCandidate?.type).toBe('RESET_ANNOUNCED');
  });

  test('EV-PREC-4: Suppressed probability candidate is written to audit_events', () => {
    const res = EventPrecedenceResolver.resolve('cycle:1', 'snap:1', [annCand, probCand], ts);
    expect(res.suppressionAudit).not.toBeNull();
    expect(res.suppressionAudit?.type).toBe('EVENT_CANDIDATES_SUPPRESSED');
    expect(res.suppressionAudit?.deduplication_key).toContain(
      'PROBABILITY_REACHED_70:RESET_ANNOUNCED'
    );
    expect(res.suppressionAudit?.payload).toHaveProperty('winningCandidate', 'RESET_ANNOUNCED');
  });
});
