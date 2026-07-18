import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestDb } from './test-utils';

describe('Database Migrations', () => {
  let db: D1Database;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  test('MIG-1: Fresh database applies all migrations successfully', async () => {
    const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(results).toBeDefined();
  });

  test('MIG-2: Expected seven tables exist', async () => {
    const { results } = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
      )
      .all();
    const tables = results.map((r: Record<string, unknown>) => r.name).sort();
    expect(tables).toEqual([
      'audit_events',
      'notification_deliveries',
      'rate_limit_records',
      'reset_cycles',
      'reset_events',
      'source_snapshots',
      'subscribers',
    ]);
  });

  test('MIG-3: Expected indexes and constraints exist', async () => {
    const { results } = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
      .all();
    const indexes = results.map((r: Record<string, unknown>) => r.name).sort();
    expect(indexes).toContain('idx_reset_cycles_one_active');
    expect(indexes).toContain('idx_reset_events_cycle');
  });

  test('MIG-4: No notify_90 or notify_completed columns exist', async () => {
    const { results } = await db.prepare('PRAGMA table_info(subscribers)').all();
    const columns = results.map((r: Record<string, unknown>) => r.name);
    expect(columns).not.toContain('notify_90');
    expect(columns).not.toContain('notify_completed');
  });

  test('MIG-5: No PROBABILITY_REACHED_90 event type is accepted', async () => {
    await expect(
      db
        .prepare(
          `
      INSERT INTO reset_events (id, reset_cycle_id, type, threshold, source_snapshot_id, created_at)
      VALUES ('evt_1', 'cycle_1', 'PROBABILITY_REACHED_90', 90, 'snap_1', '2026-07-18T00:00:00Z')
    `
        )
        .run()
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  test('MIG-6: No RESET_COMPLETED subscriber event type is accepted', async () => {
    await expect(
      db
        .prepare(
          `
      INSERT INTO reset_events (id, reset_cycle_id, type, threshold, source_snapshot_id, created_at)
      VALUES ('evt_2', 'cycle_1', 'RESET_COMPLETED', null, 'snap_1', '2026-07-18T00:00:00Z')
    `
        )
        .run()
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  test('MIG-7: reset_cycles table has transition_token column', async () => {
    const { results } = await db.prepare('PRAGMA table_info(reset_cycles)').all();
    const columns = results.map((r: Record<string, unknown>) => r.name);
    expect(columns).toContain('transition_token');
    // updated_at must still exist as a proper timestamp column
    expect(columns).toContain('updated_at');
  });
});
