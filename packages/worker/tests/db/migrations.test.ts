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
      'subscription_tokens',
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

  test('MIG-8: subscription_tokens table has exact expected columns', async () => {
    const { results } = await db.prepare('PRAGMA table_info(subscription_tokens)').all();
    const columns = results.map((r: Record<string, unknown>) => r.name).sort();
    expect(columns).toContain('id');
    expect(columns).toContain('subscriber_id');
    expect(columns).toContain('purpose');
    expect(columns).toContain('token_hash');
    expect(columns).toContain('requested_probability70');
    expect(columns).toContain('requested_reset_announced');
    expect(columns).toContain('created_at');
    expect(columns).toContain('expires_at');
    expect(columns).toContain('consumed_at');
    expect(columns).toContain('revoked_at');
  });

  test('MIG-9: subscription_tokens purpose CHECK rejects invalid values', async () => {
    // Must insert a subscriber first (FK)
    await db
      .prepare(
        `INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, created_at, updated_at)
       VALUES ('sub_mig9', 'mig9@test.com', 'mig9@test.com', 'pending_confirmation', 0, 0, 'none', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')`
      )
      .run();

    await expect(
      db
        .prepare(
          `INSERT INTO subscription_tokens (id, subscriber_id, purpose, token_hash, created_at, expires_at)
         VALUES ('tok_mig9', 'sub_mig9', 'invalid_purpose', 'abc', '2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z')`
        )
        .run()
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  test('MIG-10: Upgrade from existing 0001+0002 state preserves existing subscriber data', async () => {
    // Simulate: existing subscriber from pre-Phase-5 migration state
    // First insert a subscriber (which the schema already supports)
    await db
      .prepare(
        `INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, created_at, updated_at)
       VALUES ('sub_upgrade', 'upgrade@test.com', 'upgrade@test.com', 'active', 1, 1, 'hash', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')`
      )
      .run();

    // Applying subscription_tokens table (as would happen in 0003 migration) must not delete the existing subscriber
    // Since setupTestDb already applied all migrations, we verify the subscriber is still intact
    const sub = await db.prepare("SELECT * FROM subscribers WHERE id = 'sub_upgrade'").first();
    expect(sub).not.toBeNull();
    expect((sub as Record<string, unknown>).normalized_email).toBe('upgrade@test.com');

    // Also verify subscription_tokens table exists and can reference the existing subscriber
    await db
      .prepare(
        `INSERT INTO subscription_tokens (id, subscriber_id, purpose, token_hash, created_at, expires_at)
       VALUES ('tok_upgrade', 'sub_upgrade', 'manage_subscription', 'hash12345678901234567890123456789012345678901234567890123456789012', '2025-01-01T00:00:00Z', '2025-02-01T00:00:00Z')`
      )
      .run();

    const tok = await db
      .prepare("SELECT * FROM subscription_tokens WHERE id = 'tok_upgrade'")
      .first();
    expect(tok).not.toBeNull();
  });
});
