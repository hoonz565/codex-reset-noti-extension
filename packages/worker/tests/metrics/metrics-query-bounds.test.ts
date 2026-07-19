/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { D1MetricsRepository } from '../../src/metrics/metrics-repository';
import { setupTestDb } from '../db/test-utils';

describe('Metrics Query Bounds (DASH-METRICS-7..12)', () => {
  let db: D1Database;
  let repo: D1MetricsRepository;

  beforeEach(async () => {
    db = await setupTestDb();
    repo = new D1MetricsRepository(db);
  });

  it('DASH-METRICS-7: Due pending delivery count is correct.', async () => {
    await db
      .prepare(
        `INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('c1', 'active', '2023', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO source_snapshots (id, checked_at, created_at, lifecycle, source_health, meaningful_change, payload_hash, probability) VALUES ('s1', '2023', '2023', 'none', 'healthy', 0, 'hash', 100)`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO reset_events (id, reset_cycle_id, type, source_snapshot_id, created_at) VALUES ('e1', 'c1', 'RESET_ANNOUNCED', 's1', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, token_version, created_at, updated_at) VALUES ('sub1', 'a1@a.com', 'a1@a.com', 'active', 1, 1, 'hash1', 1, '2023', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, token_version, created_at, updated_at) VALUES ('sub2', 'a2@a.com', 'a2@a.com', 'active', 1, 1, 'hash2', 1, '2023', '2023')`
      )
      .run();

    const stmt = db.prepare(
      `INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, attempt_count, created_at, updated_at, next_attempt_at, processing_started_at) VALUES (?, 'e1', ?, 'email', 'pending', 0, '2023', '2023', ?, null)`
    );

    // d1 is due, d2 is not due
    await db.batch([
      stmt.bind('d1', 'sub1', '2023-01-01T00:00:00Z'),
      stmt.bind('d2', 'sub2', '2023-01-01T00:05:00Z'),
    ]);

    const now = new Date('2023-01-01T00:02:00Z');
    const result = await repo.getDeliveriesMetrics(now);
    expect(result.duePending).toBe(1);
  });

  it('DASH-METRICS-8: Stale processing delivery count is correct.', async () => {
    await db
      .prepare(
        `INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('c1', 'active', '2023', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO source_snapshots (id, checked_at, created_at, lifecycle, source_health, meaningful_change, payload_hash, probability) VALUES ('s1', '2023', '2023', 'none', 'healthy', 0, 'hash', 100)`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO reset_events (id, reset_cycle_id, type, source_snapshot_id, created_at) VALUES ('e1', 'c1', 'RESET_ANNOUNCED', 's1', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, token_version, created_at, updated_at) VALUES ('sub1', 'a1@a.com', 'a1@a.com', 'active', 1, 1, 'hash1', 1, '2023', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, token_version, created_at, updated_at) VALUES ('sub2', 'a2@a.com', 'a2@a.com', 'active', 1, 1, 'hash2', 1, '2023', '2023')`
      )
      .run();

    const stmt = db.prepare(
      `INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, attempt_count, created_at, updated_at, next_attempt_at, processing_started_at) VALUES (?, 'e1', ?, 'email', 'processing', 0, '2023', '2023', null, ?)`
    );

    // d1 is stale (started 10 mins ago), d2 is fresh (started 1 min ago)
    await db.batch([
      stmt.bind('d1', 'sub1', '2022-12-31T23:50:00Z'),
      stmt.bind('d2', 'sub2', '2023-01-01T00:01:00Z'),
    ]);

    const now = new Date('2023-01-01T00:02:00Z');
    const result = await repo.getDeliveriesMetrics(now);
    expect(result.staleProcessing).toBe(1);
  });

  it('DASH-METRICS-9: Subscriber event counts include only: PROBABILITY_REACHED_70, RESET_ANNOUNCED', async () => {
    await db
      .prepare(
        `INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('c1', 'completed', '2023', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO source_snapshots (id, checked_at, created_at, lifecycle, source_health, meaningful_change, payload_hash, probability) VALUES ('s1', '2023', '2023', 'none', 'healthy', 0, 'hash', 100)`
      )
      .run();

    const stmt = db.prepare(
      `INSERT INTO reset_events (id, reset_cycle_id, type, source_snapshot_id, created_at) VALUES (?, 'c1', ?, 's1', '2023-01-01T00:05:00Z')`
    );

    await db.batch([stmt.bind('e1', 'PROBABILITY_REACHED_70'), stmt.bind('e2', 'RESET_ANNOUNCED')]);

    // Seed non-subscriber lifecycle event in audit_events
    await db
      .prepare(
        `INSERT INTO audit_events (id, type, deduplication_key, subject_type, subject_id, payload_json, created_at) VALUES ('a1', 'ORCHESTRATION_STARTED', null, null, null, null, '2023-01-01T00:05:00Z')`
      )
      .run();

    const result = await repo.getEventsMetrics({
      startAt: '2023-01-01T00:00:00Z',
      endAt: '2023-01-01T00:10:00Z',
    });

    // Verify it only includes the two canonical keys
    expect(Object.keys(result).sort()).toEqual(['probabilityReached70', 'resetAnnounced']);
    expect(result.probabilityReached70).toBe(1);
    expect(result.resetAnnounced).toBe(1);
  });

  it('DASH-METRICS-10: Metrics service returns no raw rows or PII.', async () => {
    // In actual implementation, repo returns sums and counts, not rows.
    const now = new Date('2023-01-01T00:02:00Z');
    const result = await repo.getDeliveriesMetrics(now);
    expect(result).not.toHaveProperty('subscribers');
    expect(result).not.toHaveProperty('emails');
    expect(
      Object.keys(result).every((k) => typeof (result as Record<string, unknown>)[k] === 'number')
    ).toBe(true);
  });

  it('DASH-METRICS-11: All time-window queries are bounded.', async () => {
    await db
      .prepare(
        `INSERT INTO orchestration_runs (id, trigger_type, status, started_at, finished_at, source_outcome, events_created, deliveries_prepared, deliveries_sent, deliveries_retried, deliveries_failed, deliveries_cancelled, stale_deliveries_recovered, created_at, updated_at) VALUES ('r1', 'scheduled', 'completed', '2022-12-31T23:00:00Z', '2022-12-31T23:00:05Z', 'unchanged_snapshot_persisted', 0, 0, 0, 0, 0, 0, 0, '2023', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('c2', 'active', '2023', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO source_snapshots (id, checked_at, created_at, lifecycle, source_health, meaningful_change, payload_hash, probability) VALUES ('s2', '2023', '2023', 'none', 'healthy', 0, 'hash', 100)`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO reset_events (id, reset_cycle_id, type, source_snapshot_id, created_at) VALUES ('e3', 'c2', 'RESET_ANNOUNCED', 's2', '2022-12-31T23:00:00Z')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, token_version, created_at, updated_at) VALUES ('sub3', 'a3@a.com', 'a3@a.com', 'active', 1, 1, 'hash3', 1, '2023', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, attempt_count, created_at, updated_at, next_attempt_at, processing_started_at) VALUES ('d3', 'e3', 'sub3', 'email', 'pending', 0, '2022-12-31T23:00:00Z', '2022-12-31T23:00:00Z', null, null)`
      )
      .run();

    const orchResult = await repo.getOrchestrationMetrics({
      startAt: '2023-01-01T00:00:00Z',
      endAt: '2023-01-01T00:10:00Z',
    });

    // r1 is completely outside the window, so completed count should be 0.
    expect(orchResult.completed).toBe(0);

    const now = new Date('2023-01-01T00:10:00Z');
    const delivResult = await repo.getDeliveriesMetrics(now);
    // d3 was created outside the orchestration window but delivery is global, so it should be counted
    expect(delivResult.pending).toBe(1);
  });

  it('DASH-METRICS-12: Metrics read model performs no writes, provider calls, or orchestration.', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // Also track query methods if possible
    const prepareSpy = vi.spyOn(db, 'prepare');

    const now = new Date('2023-01-01T00:02:00Z');

    await repo.getDeliveriesMetrics(now);
    await repo.getEventsMetrics({ startAt: '2023', endAt: '2023' });
    await repo.getOrchestrationMetrics({ startAt: '2023', endAt: '2023' });
    await repo.getSourceMetrics();

    expect(fetchSpy).not.toHaveBeenCalled();

    const queries = prepareSpy.mock.calls.map((c) => c[0].toUpperCase());
    for (const q of queries) {
      expect(q).not.toContain('INSERT ');
      expect(q).not.toContain('UPDATE ');
      expect(q).not.toContain('DELETE ');
    }

    fetchSpy.mockRestore();
    prepareSpy.mockRestore();
  });
});
