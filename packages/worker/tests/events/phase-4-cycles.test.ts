import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestDb } from '../db/test-utils';
import { DbTransactions } from '../../src/db/transactions';
import { ResetCycleRepository } from '../../src/db/repositories/ResetCycleRepository';
import crypto from 'node:crypto';

describe('Phase 4 - EV-CYCLE explicitly', () => {
  let db: D1Database;
  let cycleRepo: ResetCycleRepository;
  let tx: DbTransactions;

  beforeAll(async () => {
    db = await setupTestDb();
    cycleRepo = new ResetCycleRepository(db);
    tx = new DbTransactions(db);
  });

  const getAuditParams = (id: string, cycleId: string) => ({
    id,
    type: 'CYCLE_TRANSITION',
    deduplication_key: `CYCLE_TRANSITION:${cycleId}`,
    subject_type: 'reset_cycle',
    subject_id: cycleId,
    payload: { from_cycle_id: cycleId, to_cycle_id: 'cycle:new' },
    created_at: '2023-01-02T00:00:00Z',
  });

  const getCycleParams = (id: string) => ({
    id,
    anchor_reset_at: '2023-01-02T00:00:00Z',
    state: 'active',
    created_at: '2023-01-02T00:00:00Z',
  });

  test('EV-CYCLE-1, 2, 3: Transition commits successfully', async () => {
    await db
      .prepare(
        "INSERT INTO reset_cycles (id, anchor_reset_at, state, created_at, updated_at) VALUES ('cycle:old', '2023-01-01T00:00:00Z', 'active', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')"
      )
      .run();
    await db
      .prepare(
        "INSERT INTO source_snapshots (id, reset_cycle_id, payload_hash, checked_at, meaningful_change, created_at, lifecycle, source_health, probability) VALUES ('snap:1', 'cycle:old', 'hash', '2023-01-01T00:00:00Z', 1, '2023-01-01T00:00:00Z', 'none', 'healthy', 60)"
      )
      .run();

    const res = await tx.performCycleTransition(
      getAuditParams(crypto.randomUUID(), 'cycle:old'),
      'cycle:old',
      '2023-01-02T00:00:00Z',
      getCycleParams('cycle:new'),
      'snap:1'
    );
    expect(res.outcome).toBe('transitioned');

    const oldCycle = await cycleRepo.findById('cycle:old');
    expect(oldCycle?.state).toBe('completed');
    expect(oldCycle?.completed_at).toBeTruthy();
    expect(oldCycle?.transition_token).toBeTruthy();

    const newCycle = await cycleRepo.findById('cycle:new');
    expect(newCycle?.state).toBe('active');
    expect(newCycle?.anchor_reset_at).toBe('2023-01-02T00:00:00Z');

    const audit = await db
      .prepare('SELECT * FROM audit_events WHERE type = ?')
      .bind('CYCLE_TRANSITION')
      .first<{ payload_json: string }>();
    expect(audit).toBeTruthy();
    const payload = JSON.parse(audit!.payload_json);
    expect(payload.from_cycle_id).toBe('cycle:old');
    expect(payload.to_cycle_id).toBe('cycle:new');
  });

  test('EV-CYCLE-4: Retry returns already_transitioned', async () => {
    const res = await tx.performCycleTransition(
      getAuditParams('audit:same', 'cycle:old'),
      'cycle:old',
      '2023-01-02T00:00:00Z',
      getCycleParams('cycle:new'),
      'snap:1'
    );
    expect(res.outcome).toBe('already_transitioned');
  });

  test('EV-CYCLE-5: Transition fails if snapshot belongs to unexpected cycle', async () => {
    const res = await tx.performCycleTransition(
      getAuditParams(crypto.randomUUID(), 'cycle:old'),
      'cycle:old',
      '2023-01-02T00:00:00Z',
      getCycleParams('cycle:new3'),
      'snap:unknown'
    );
    expect(res.outcome).toBe('stale_precondition');
  });

  test('EV-CYCLE-6: Transition fails if cycle is not active', async () => {
    const res = await tx.performCycleTransition(
      getAuditParams(crypto.randomUUID(), 'cycle:old'),
      'cycle:old',
      '2023-01-02T00:00:00Z',
      getCycleParams('cycle:another'),
      'snap:1'
    );
    expect(res.outcome).toBe('stale_precondition');
  });

  test('EV-CYCLE-7: Guard ensures exact single commit for transition', async () => {
    const cycleCounts = await db
      .prepare(
        "SELECT SUM(CASE WHEN id = 'cycle:new' THEN 1 ELSE 0 END) AS target_count, SUM(CASE WHEN state = 'active' THEN 1 ELSE 0 END) AS active_count FROM reset_cycles"
      )
      .first<{ target_count: number; active_count: number }>();
    const auditCount = await db
      .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE type = 'CYCLE_TRANSITION'")
      .first<{ count: number }>();

    expect(cycleCounts?.target_count).toBe(1);
    expect(cycleCounts?.active_count).toBe(1);
    expect(auditCount?.count).toBe(1);
  });

  test('EV-CYCLE-ASSOC-5: Snapshot belongs to unexpected cycle fails', async () => {
    await db.prepare("UPDATE reset_cycles SET state = 'completed' WHERE state = 'active'").run();
    await db
      .prepare(
        "INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('cycle:other', 'active', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')"
      )
      .run();
    await db
      .prepare(
        "INSERT INTO source_snapshots (id, reset_cycle_id, payload_hash, checked_at, meaningful_change, created_at, lifecycle, source_health, probability) VALUES ('snap:2', 'cycle:other', 'hash', '2023-01-01T00:00:00Z', 1, '2023-01-01T00:00:00Z', 'none', 'healthy', 60)"
      )
      .run();

    const res = await tx.performCycleTransition(
      getAuditParams(crypto.randomUUID(), 'cycle:other'),
      'cycle:other',
      '2023-01-02T00:00:00Z',
      getCycleParams('cycle:new2'),
      'snap:1'
    );
    expect(res.outcome).toBe('stale_precondition');
  });

  test('EV-CYCLE-8: Unavailable cannot transition', async () => {
    await db.prepare("UPDATE reset_cycles SET state = 'completed' WHERE state = 'active'").run();
    await db
      .prepare(
        "INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('cycle:unavailable', 'active', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')"
      )
      .run();
    await db
      .prepare(
        "INSERT INTO source_snapshots (id, reset_cycle_id, payload_hash, checked_at, meaningful_change, created_at, lifecycle, source_health, probability) VALUES ('snap:unavailable', 'cycle:unavailable', 'hash-unavailable', '2023-01-01T00:00:00Z', 1, '2023-01-01T00:00:00Z', 'none', 'unavailable', 60)"
      )
      .run();

    const result = await tx.performCycleTransition(
      getAuditParams(crypto.randomUUID(), 'cycle:unavailable'),
      'cycle:unavailable',
      '2023-01-02T00:00:00Z',
      getCycleParams('cycle:should-not-exist'),
      'snap:unavailable'
    );
    expect(result.outcome).toBe('stale_precondition');
    expect((await cycleRepo.findById('cycle:unavailable'))?.state).toBe('active');
    expect(await cycleRepo.findById('cycle:should-not-exist')).toBeNull();
  });
  test('EV-CYCLE-9: timestamps remain valid ISO', async () => {
    const cycles = await db
      .prepare('SELECT created_at, updated_at, completed_at FROM reset_cycles')
      .all<{ created_at: string; updated_at: string; completed_at: string | null }>();
    for (const cycle of cycles.results) {
      expect(Number.isNaN(Date.parse(cycle.created_at))).toBe(false);
      expect(Number.isNaN(Date.parse(cycle.updated_at))).toBe(false);
      if (cycle.completed_at) expect(Number.isNaN(Date.parse(cycle.completed_at))).toBe(false);
    }
  });
  test('EV-CYCLE-10: transition_token is used', async () => {
    const transitioned = await cycleRepo.findById('cycle:old');
    expect(transitioned?.transition_token).toMatch(/^[0-9a-f-]{36}$/i);
    expect(transitioned?.state).toBe('completed');
  });
});
