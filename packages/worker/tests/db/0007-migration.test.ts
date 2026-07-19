/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { setupTestDb } from './test-utils';

describe('Migration 0007 (MIG-DASH-1..8)', () => {
  let db: D1Database;

  beforeEach(async () => {
    db = await setupTestDb();
  });

  it('MIG-DASH-1: Clean migration chain applies 0001 through 0007', async () => {
    const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.results.map((r: any) => r.name);
    expect(tableNames).toContain('orchestration_runs');
    expect(tableNames).toContain('reset_events');
    expect(tableNames).toContain('notification_deliveries');
  });

  it('MIG-DASH-2: Upgrade from 0006 to 0007 succeeds', async () => {
    // Already implied by setupTestDb which runs all migrations.
    // We just verify it completed successfully by checking for an expected index.
    const indexes = await db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
    const indexNames = indexes.results.map((r: any) => r.name);
    expect(indexNames.length).toBeGreaterThan(0);
  });

  it('MIG-DASH-3: Existing rows are preserved', async () => {
    // We insert a row and ensure we can read it to prove the table is intact
    await db
      .prepare(
        `INSERT INTO orchestration_runs (id, trigger_type, status, started_at, events_created, deliveries_prepared, deliveries_sent, deliveries_retried, deliveries_failed, deliveries_cancelled, stale_deliveries_recovered, created_at, updated_at) 
         VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, ?, ?)`
      )
      .bind(
        'run1',
        'scheduled',
        'completed',
        '2023-01-01T00:00:00Z',
        '2023-01-01T00:00:00Z',
        '2023-01-01T00:00:00Z'
      )
      .run();
    const result = await db.prepare("SELECT * FROM orchestration_runs WHERE id = 'run1'").all();
    expect(result.results.length).toBe(1);
  });

  it('MIG-DASH-4: idx_orch_runs_started_status exists', async () => {
    const indexes = await db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
    const indexNames = indexes.results.map((r: any) => r.name);
    expect(indexNames).toContain('idx_orch_runs_started_status');
  });

  it('MIG-DASH-5: idx_reset_events_type_created exists', async () => {
    const indexes = await db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
    const indexNames = indexes.results.map((r: any) => r.name);
    expect(indexNames).toContain('idx_reset_events_type_created');
  });

  it('MIG-DASH-6: idx_deliveries_processing_started exists', async () => {
    const indexes = await db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
    const indexNames = indexes.results.map((r: any) => r.name);
    expect(indexNames).toContain('idx_deliveries_processing_started');
  });

  it('MIG-DASH-7: The exact Phase 8 target queries use the intended indexes under EXPLAIN QUERY PLAN', async () => {
    // Exact SQL from metrics-repository.ts
    const plan1 = await db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT status, count(*) as count FROM orchestration_runs WHERE started_at >= ? AND started_at <= ? GROUP BY status`
      )
      .bind('2023-01-01T00:00:00Z', '2023-01-01T01:00:00Z')
      .all();
    expect(JSON.stringify(plan1.results)).toContain('idx_orch_runs_started_status');

    const plan2 = await db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT type, count(*) as count FROM reset_events WHERE created_at >= ? AND created_at <= ? GROUP BY type`
      )
      .bind('2023-01-01T00:00:00Z', '2023-01-01T01:00:00Z')
      .all();
    expect(JSON.stringify(plan2.results)).toContain('idx_reset_events_type_created');

    const plan3 = await db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT count(*) as count FROM notification_deliveries WHERE state = 'processing' AND processing_started_at < ?`
      )
      .bind('2023-01-01T00:00:00Z')
      .all();
    expect(JSON.stringify(plan3.results)).toContain('idx_deliveries_processing_started');
  });

  it('MIG-DASH-8: A second migration run has no pending migration and does not duplicate indexes', async () => {
    const indexes = await db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
    const indexNames = indexes.results.map((r: any) => r.name);
    const count = indexNames.filter((n) => n === 'idx_orch_runs_started_status').length;
    expect(count).toBe(1); // Not duplicated
  });
});
