import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestDb } from './test-utils';
import { ResetEventRepository, ResetCycleRepository, SourceSnapshotRepository } from '../../src/db';
import * as crypto from 'crypto';

describe('Reset Event Repository', () => {
  let db: D1Database;
  let repo: ResetEventRepository;
  let cycleRepo: ResetCycleRepository;
  let snapRepo: SourceSnapshotRepository;

  beforeAll(async () => {
    db = await setupTestDb();
    repo = new ResetEventRepository(db);
    cycleRepo = new ResetCycleRepository(db);
    snapRepo = new SourceSnapshotRepository(db);

    await cycleRepo.create({
      id: 'cycle:evt_test',
      anchor_reset_at: null,
      state: 'active',
      created_at: new Date().toISOString(),
    });

    await snapRepo.create({
      id: 'snap:evt_1',
      reset_cycle_id: 'cycle:evt_test',
      probability: 95,
      lifecycle: 'announced',
      source_health: 'healthy',
      source_updated_at: new Date().toISOString(),
      checked_at: new Date().toISOString(),
      payload_hash: 'hash',
      meaningful_change: true,
      created_at: new Date().toISOString(),
    });
  });

  test('DB-EVENT-1: Insert PROBABILITY_REACHED_70 with threshold=70 and actual current probability=95', async () => {
    const { result } = await repo.createIfAbsent({
      id: crypto.randomUUID(),
      reset_cycle_id: 'cycle:evt_test',
      type: 'PROBABILITY_REACHED_70',
      threshold: 70,
      previous_probability: 60,
      current_probability: 95,
      source_signal_id: null,
      source_snapshot_id: 'snap:evt_1',
      created_at: new Date().toISOString(),
    });

    expect(result).toBe('inserted');
    const evt = await repo.findByCycleAndType('cycle:evt_test', 'PROBABILITY_REACHED_70');
    expect(evt?.current_probability).toBe(95);
  });

  test('DB-EVENT-2: Insert RESET_ANNOUNCED', async () => {
    const { result } = await repo.createIfAbsent({
      id: crypto.randomUUID(),
      reset_cycle_id: 'cycle:evt_test',
      type: 'RESET_ANNOUNCED',
      threshold: null,
      previous_probability: 95,
      current_probability: 95,
      source_signal_id: null,
      source_snapshot_id: 'snap:evt_1',
      created_at: new Date().toISOString(),
    });

    expect(result).toBe('inserted');
  });

  test('Idempotency: Duplicate event in same cycle returns already_exists', async () => {
    const { result } = await repo.createIfAbsent({
      id: crypto.randomUUID(),
      reset_cycle_id: 'cycle:evt_test',
      type: 'PROBABILITY_REACHED_70',
      threshold: 70,
      previous_probability: 60,
      current_probability: 99,
      source_signal_id: null,
      source_snapshot_id: 'snap:evt_1',
      created_at: new Date().toISOString(),
    });

    expect(result).toBe('already_exists');
  });

  test('DB-EVENT-4: PROBABILITY_REACHED_90 rejected', async () => {
    // Constraint violation
    const res = await repo.createIfAbsent({
      id: crypto.randomUUID(),
      reset_cycle_id: 'cycle:evt_test',
      type: 'PROBABILITY_REACHED_90',
      threshold: 90,
      previous_probability: 80,
      current_probability: 92,
      source_signal_id: null,
      source_snapshot_id: 'snap:evt_1',
      created_at: new Date().toISOString(),
    });
    expect(res.result).toBe('error');
  });

  test('DB-EVENT-5: RESET_COMPLETED rejected from reset_events', async () => {
    const res = await repo.createIfAbsent({
      id: crypto.randomUUID(),
      reset_cycle_id: 'cycle:evt_test',
      type: 'RESET_COMPLETED',
      threshold: null,
      previous_probability: 95,
      current_probability: null,
      source_signal_id: null,
      source_snapshot_id: 'snap:evt_1',
      created_at: new Date().toISOString(),
    });
    expect(res.result).toBe('error');
  });

  test('REPO-CONFLICT-3: Foreign-key violation is surfaced as an error', async () => {
    const res = await repo.createIfAbsent({
      id: crypto.randomUUID(),
      reset_cycle_id: 'cycle:does_not_exist', // FK violation
      type: 'RESET_ANNOUNCED',
      threshold: null,
      previous_probability: 95,
      current_probability: 95,
      source_signal_id: null,
      source_snapshot_id: 'snap:evt_1',
      created_at: new Date().toISOString(),
    });
    expect(res.result).toBe('error');
  });

  test('DB-EVENT-SNAPSHOT-1: Subscriber event with null source_snapshot_id is rejected', async () => {
    const res = await repo.createIfAbsent({
      id: crypto.randomUUID(),
      reset_cycle_id: 'cycle:evt_test',
      type: 'RESET_ANNOUNCED',
      threshold: null,
      previous_probability: 95,
      current_probability: 95,
      source_signal_id: null,
      source_snapshot_id: null as unknown as string, // NOT NULL violation
      created_at: new Date().toISOString(),
    });
    expect(res.result).toBe('error');
  });

  test('DB-EVENT-SNAPSHOT-2: Subscriber event with nonexistent source_snapshot_id is rejected', async () => {
    // Use a fresh cycle so ON CONFLICT(reset_cycle_id, type) doesn't mask the FK violation
    await cycleRepo.create({
      id: 'cycle:snap2_test',
      anchor_reset_at: null,
      state: 'completed',
      created_at: new Date().toISOString(),
    });
    const res = await repo.createIfAbsent({
      id: crypto.randomUUID(),
      reset_cycle_id: 'cycle:snap2_test',
      type: 'RESET_ANNOUNCED',
      threshold: null,
      previous_probability: 95,
      current_probability: 95,
      source_signal_id: null,
      source_snapshot_id: 'nonexistent_snap_id', // FK violation — no matching snapshot exists
      created_at: new Date().toISOString(),
    });
    expect(res.result).toBe('error');
  });
});
