import { describe, test, expect } from 'vitest';
import { CycleStateResolver } from '../../src/events/cycle-resolver';
import { CodexResetStatus } from '@codex-reset/shared';
import { ResetCycleRow } from '../../src/db/schema';

describe('Cycle Resolver', () => {
  const activeCycle: ResetCycleRow = {
    id: 'cycle:2023',
    anchor_reset_at: '2023-01-01T00:00:00Z',
    state: 'active',
    announcement_at: null,
    completed_at: null,
    transition_token: null,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  };

  const baseStatus: CodexResetStatus = {
    schemaVersion: 1,
    probability: 0,
    lifecycle: 'none',
    resetCycleId: 'cycle:2023',
    latestResetAt: '2023-01-01T00:00:00Z',
    announcementAt: null,
    title: '',
    description: '',
    latestSignal: null,
    sourceUrl: '',
    sourceUpdatedAt: '',
    checkedAt: '',
    statusChangedAt: '',
    publishedAt: '',
    sourceHealth: 'healthy',
    sourceWarnings: [],
    parserVersion: '1',
  };

  test('EV-CYCLE-8: Unavailable snapshot cannot transition cycle', () => {
    // If it's not fresh, we pass isFresh=false
    const status = { ...baseStatus, latestResetAt: '2023-02-01T00:00:00Z' }; // new reset date
    const res = CycleStateResolver.resolve(activeCycle, status, false);
    expect(res.outcome).toBe('cycle_active');
  });

  test('EV-CYCLE-1: New latestResetAt transitions Cycle A to Cycle B', () => {
    const status = { ...baseStatus, latestResetAt: '2023-02-01T00:00:00Z' };
    const res = CycleStateResolver.resolve(activeCycle, status, true);
    expect(res.outcome).toBe('cycle_transition_required');
    if (res.outcome === 'cycle_transition_required') {
      expect(res.cycleId).toBe('cycle:2023');
      expect(res.newLatestResetAt).toBe('2023-02-01T00:00:00Z');
    }
  });

  test('EV-CYCLE-2: Cycle B ID equals cycle:<newLatestResetAt> (handled in service, but logic maps it)', () => {
    const status = { ...baseStatus, latestResetAt: '2023-02-01T00:00:00Z' };
    const res = CycleStateResolver.resolve(activeCycle, status, true);
    expect(res.newLatestResetAt).toBe('2023-02-01T00:00:00Z');
    // service will generate 'cycle:' + newLatestResetAt
  });
});
