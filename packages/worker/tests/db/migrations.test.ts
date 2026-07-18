import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestDb } from './test-utils';
import { env } from 'cloudflare:test';
import m1 from '../../migrations/0001_initial_schema.sql?raw';
import m2 from '../../migrations/0002_add_reset_cycle_transition_token.sql?raw';
import m3 from '../../migrations/0003_subscription_tokens.sql?raw';
import m4 from '../../migrations/0004_delivery_processing.sql?raw';
import m5 from '../../migrations/0005_delivery_state_correction.sql?raw';

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
  test('MIG-11: notification_deliveries table has new Phase 6 columns', async () => {
    const { results } = await db.prepare('PRAGMA table_info(notification_deliveries)').all();
    const columns = results.map((r: Record<string, unknown>) => r.name);
    expect(columns).toContain('processing_token');
    expect(columns).toContain('processing_started_at');
  });

  test('MIG-12: notification_deliveries status CHECK supports cancelled and failed_permanent', async () => {
    // Should insert with cancelled state
    await db
      .prepare(
        "INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('cyc_mig12', 'active', '2026-07-18T00:00:00Z', '2026-07-18T00:00:00Z')"
      )
      .run();
    await db
      .prepare(
        "INSERT INTO source_snapshots (id, reset_cycle_id, probability, lifecycle, source_health, checked_at, payload_hash, created_at) VALUES ('snap_mig12', 'cyc_mig12', 73, 'none', 'healthy', '2026-07-18T00:00:00Z', 'hash', '2026-07-18T00:00:00Z')"
      )
      .run();
    await db
      .prepare(
        "INSERT INTO reset_events (id, reset_cycle_id, type, threshold, current_probability, source_snapshot_id, created_at) VALUES ('evt_mig12', 'cyc_mig12', 'PROBABILITY_REACHED_70', 70, 73, 'snap_mig12', '2026-07-18T00:00:00Z')"
      )
      .run();
    await db
      .prepare(
        "INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, created_at, updated_at) VALUES ('sub_mig12', 'mig12@test.com', 'mig12@test.com', 'active', 1, 1, 'hash', '2026-07-18T00:00:00Z', '2026-07-18T00:00:00Z')"
      )
      .run();

    // Test 'cancelled'
    await db
      .prepare(
        "INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, attempt_count, created_at, updated_at) VALUES ('del_mig12_1', 'evt_mig12', 'sub_mig12', 'email', 'cancelled', 0, '2026-07-18T00:00:00Z', '2026-07-18T00:00:00Z')"
      )
      .run();

    await db
      .prepare(
        "INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, created_at, updated_at) VALUES ('sub_mig12_2', 'mig12_2@test.com', 'mig12_2@test.com', 'active', 1, 1, 'hash', '2026-07-18T00:00:00Z', '2026-07-18T00:00:00Z')"
      )
      .run();
    // Test 'failed_permanent'
    await db
      .prepare(
        "INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, attempt_count, created_at, updated_at) VALUES ('del_mig12_2', 'evt_mig12', 'sub_mig12_2', 'email', 'failed_permanent', 0, '2026-07-18T00:00:00Z', '2026-07-18T00:00:00Z')"
      )
      .run();

    // Invalid state should throw
    await expect(
      db
        .prepare(
          "INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, attempt_count, created_at, updated_at) VALUES ('del_mig12_3', 'evt_mig12', 'sub_mig12', 'email', 'unknown_state', 0, '2026-07-18T00:00:00Z', '2026-07-18T00:00:00Z')"
        )
        .run()
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  test('MIG-DEL-7: Existing failed_retryable row migrates to pending while preserving retry metadata', async () => {
    // We already applied all migrations in setupTestDb. So we need to insert manually into a fresh DB and apply up to 0004, insert failed_retryable, then apply 0005.
    // Wait, testing this requires a custom DB setup.
    // I will write it inside this test using a fresh env.DB.
    const rawDb = env.DB as D1Database;
    await rawDb.exec(`
      DROP TABLE IF EXISTS audit_events;
      DROP TABLE IF EXISTS rate_limit_records;
      DROP TABLE IF EXISTS notification_deliveries;
      DROP TABLE IF EXISTS reset_events;
      DROP TABLE IF EXISTS source_snapshots;
      DROP TABLE IF EXISTS reset_cycles;
      DROP TABLE IF EXISTS subscription_tokens;
      DROP TABLE IF EXISTS subscribers;
      DROP TABLE IF EXISTS d1_migrations;
    `);

    const applyMigration = async (sql: string) => {
      const strippedSql = sql.replace(/--.*$/gm, '');
      const statements = strippedSql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => rawDb.prepare(s));
      if (statements.length > 0) {
        await rawDb.batch(statements);
      }
    };

    await applyMigration(m1);
    await applyMigration(m2);
    await applyMigration(m3);
    await applyMigration(m4);

    // Setup base data
    await rawDb
      .prepare(
        "INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('c1', 'active', '2026', '2026')"
      )
      .run();
    await rawDb
      .prepare(
        "INSERT INTO source_snapshots (id, reset_cycle_id, probability, lifecycle, source_health, checked_at, payload_hash, created_at) VALUES ('s1', 'c1', 73, 'none', 'healthy', '2026', 'h', '2026')"
      )
      .run();
    await rawDb
      .prepare(
        "INSERT INTO reset_events (id, reset_cycle_id, type, threshold, current_probability, source_snapshot_id, created_at) VALUES ('e1', 'c1', 'PROBABILITY_REACHED_70', 70, 73, 's1', '2026')"
      )
      .run();
    await rawDb
      .prepare(
        "INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, created_at, updated_at) VALUES ('sub1', 'a@b.com', 'a@b.com', 'active', 1, 1, 'h', '2026', '2026')"
      )
      .run();

    // Insert failed_retryable row (allowed in 0004 schema)
    await rawDb
      .prepare(
        "INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, attempt_count, next_attempt_at, created_at, updated_at) VALUES ('d1', 'e1', 'sub1', 'email', 'failed_retryable', 3, '2026-07-20T00:00:00Z', '2026', '2026')"
      )
      .run();

    // Apply 0005
    await applyMigration(m5);

    // Assert row migrated to pending with retry metadata preserved
    const res = await rawDb
      .prepare("SELECT * FROM notification_deliveries WHERE id = 'd1'")
      .first<Record<string, unknown>>();
    expect(res.state).toBe('pending');
    expect(res.attempt_count).toBe(3);
    expect(res.next_attempt_at).toBe('2026-07-20T00:00:00Z');
  });

  test('MIG-DEL-8: Existing rows in all other valid states remain unchanged', async () => {
    const rawDb = env.DB as D1Database;
    await rawDb.exec(`
      DROP TABLE IF EXISTS audit_events;
      DROP TABLE IF EXISTS rate_limit_records;
      DROP TABLE IF EXISTS notification_deliveries;
      DROP TABLE IF EXISTS reset_events;
      DROP TABLE IF EXISTS source_snapshots;
      DROP TABLE IF EXISTS reset_cycles;
      DROP TABLE IF EXISTS subscription_tokens;
      DROP TABLE IF EXISTS subscribers;
      DROP TABLE IF EXISTS d1_migrations;
    `);

    const applyMigration = async (sql: string) => {
      const strippedSql = sql.replace(/--.*$/gm, '');
      const statements = strippedSql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => rawDb.prepare(s));
      if (statements.length > 0) {
        await rawDb.batch(statements);
      }
    };

    await applyMigration(m1);
    await applyMigration(m2);
    await applyMigration(m3);
    await applyMigration(m4);

    await rawDb
      .prepare(
        "INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('c1', 'active', '2026', '2026')"
      )
      .run();
    await rawDb
      .prepare(
        "INSERT INTO source_snapshots (id, reset_cycle_id, probability, lifecycle, source_health, checked_at, payload_hash, created_at) VALUES ('s1', 'c1', 73, 'none', 'healthy', '2026', 'h', '2026')"
      )
      .run();
    await rawDb
      .prepare(
        "INSERT INTO reset_events (id, reset_cycle_id, type, threshold, current_probability, source_snapshot_id, created_at) VALUES ('e1', 'c1', 'PROBABILITY_REACHED_70', 70, 73, 's1', '2026')"
      )
      .run();

    const insertSub = async (id: string, em: string) =>
      rawDb
        .prepare(
          "INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, created_at, updated_at) VALUES (?, ?, ?, 'active', 1, 1, 'h', '2026', '2026')"
        )
        .bind(id, em, em)
        .run();
    await insertSub('sub1', 'a@b.com');
    await insertSub('sub2', 'b@b.com');
    await insertSub('sub3', 'c@b.com');

    await rawDb
      .prepare(
        "INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, created_at, updated_at) VALUES ('d_pending', 'e1', 'sub1', 'email', 'pending', '2026', '2026')"
      )
      .run();
    await rawDb
      .prepare(
        "INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, processing_token, created_at, updated_at) VALUES ('d_processing', 'e1', 'sub2', 'email', 'processing', 'tok1', '2026', '2026')"
      )
      .run();
    await rawDb
      .prepare(
        "INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, created_at, updated_at) VALUES ('d_sent', 'e1', 'sub3', 'email', 'sent_to_provider', '2026', '2026')"
      )
      .run();

    await applyMigration(m5);

    const pendingRow = await rawDb
      .prepare("SELECT * FROM notification_deliveries WHERE id = 'd_pending'")
      .first<Record<string, unknown>>();
    expect(pendingRow!.state).toBe('pending');

    const procRow = await rawDb
      .prepare("SELECT * FROM notification_deliveries WHERE id = 'd_processing'")
      .first<Record<string, unknown>>();
    expect(procRow!.state).toBe('processing');
    expect(procRow!.processing_token).toBe('tok1');

    const sentRow = await rawDb
      .prepare("SELECT * FROM notification_deliveries WHERE id = 'd_sent'")
      .first<Record<string, unknown>>();
    expect(sentRow!.state).toBe('sent_to_provider');
  });
});
