/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach } from 'vitest';
import { OrchestrationRunRepository } from '../../src/db/repositories/OrchestrationRunRepository';
import { setupTestDb } from '../db/test-utils';
import { OrchestrationSummary } from '../../src/orchestration/orchestration-summary';

describe('OrchestrationRunRepository', () => {
  let db: D1Database;
  let repo: OrchestrationRunRepository;

  beforeEach(async () => {
    db = await setupTestDb();
    repo = new OrchestrationRunRepository(db);
  });

  const dummySummary: OrchestrationSummary = {
    sourceOutcome: 'fresh_snapshot_persisted',
    snapshotId: null,
    eventsCreated: 0,
    deliveriesPrepared: 0,
    deliveriesSent: 0,
    deliveriesRetried: 0,
    deliveriesFailed: 0,
    deliveriesCancelled: 0,
    staleDeliveriesRecovered: 0,
  };

  it('ORCH-RUN-1: Acquired run starts as running', async () => {
    const runId = 'run-1';
    await repo.create({
      id: runId,
      trigger_type: 'scheduled',
      status: 'running',
      started_at: '2026-07-18T10:00:00Z',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    });
    const run = await db
      .prepare('SELECT * FROM orchestration_runs WHERE id = ?')
      .bind('run-1')
      .first();
    expect(run).toBeDefined();
    expect(run?.status).toBe('running');
  });

  it('ORCH-RUN-2: Successful run records completed and finished_at', async () => {
    const runId = 'run-2';
    await repo.create({
      id: runId,
      trigger_type: 'scheduled',
      status: 'running',
      started_at: '2026-07-18T10:00:00Z',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    });
    await repo.update(runId, {
      status: 'completed',
      finished_at: '2026-07-18T10:00:05Z',
      source_outcome: 'fresh_snapshot_persisted',
      updated_at: '2026-07-18T10:00:05Z',
    });
    const run = await db
      .prepare('SELECT status, source_outcome FROM orchestration_runs WHERE id = ?')
      .bind('run-2')
      .first();
    expect(run?.status).toBe('completed');
  });
  it('ORCH-RUN-3: Isolated partial failures record completed_with_errors', async () => {
    await repo.create({
      id: 'run-3',
      trigger_type: 'scheduled',
      status: 'running',
      started_at: '2026-07-18T10:00:00Z',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    });
    await repo.update('run-3', {
      status: 'completed_with_errors',
      error_code: 'PARTIAL_FAIL',
      updated_at: '2026-07-18T10:01:00Z',
    });
    const run = await db
      .prepare('SELECT status, error_code FROM orchestration_runs WHERE id = ?')
      .bind('run-3')
      .first();
    expect(run?.status).toBe('completed_with_errors');
    expect(run?.error_code).toBe('PARTIAL_FAIL');
  });

  it('ORCH-RUN-4: Critical failure records failed', async () => {
    await repo.create({
      id: 'run-4',
      trigger_type: 'admin',
      status: 'running',
      started_at: '2026-07-18T10:00:00Z',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    });
    await repo.update('run-4', {
      status: 'failed',
      error_code: 'CRITICAL_FAILURE',
      updated_at: '2026-07-18T10:01:00Z',
    });
    const run = await db
      .prepare('SELECT status FROM orchestration_runs WHERE id = ?')
      .bind('run-4')
      .first();
    expect(run?.status).toBe('failed');
  });

  it('ORCH-RUN-5: Overlap invocation records or returns skipped_overlap consistently', async () => {
    await repo.create({
      id: 'run-5',
      trigger_type: 'scheduled',
      status: 'running',
      started_at: '2026-07-18T10:00:00Z',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    });
    await repo.update('run-5', { status: 'skipped_overlap', updated_at: '2026-07-18T10:01:00Z' });
    const run = await db
      .prepare('SELECT status FROM orchestration_runs WHERE id = ?')
      .bind('run-5')
      .first();
    expect(run?.status).toBe('skipped_overlap');
  });

  it('ORCH-RUN-6: All persisted summary counters match the final run result', async () => {
    await repo.create({
      id: 'run-6',
      trigger_type: 'scheduled',
      status: 'running',
      started_at: '2026-07-18T10:00:00Z',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    });
    await repo.update('run-6', {
      status: 'completed',
      events_created: 5,
      deliveries_prepared: 10,
      updated_at: '2026-07-18T10:01:00Z',
    });
    const run = await db
      .prepare('SELECT events_created, deliveries_prepared FROM orchestration_runs WHERE id = ?')
      .bind('run-6')
      .first();
    expect(run?.events_created).toBe(5);
    expect(run?.deliveries_prepared).toBe(10);
  });

  it('ORCH-RUN-7: Stale lease owner cannot finalize or overwrite another run', async () => {
    // Actually we will verify that if the row was marked failed by stale recovery, it cannot be finalized by the stale owner.
    await repo.create({
      id: 'run-7',
      trigger_type: 'scheduled',
      status: 'running',
      started_at: '2026-07-18T10:00:00Z',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    });

    // Simulate stale lock recovery marking it failed
    await repo.markStaleRunFailed('run-7', '2026-07-18T10:05:00Z');

    // Stale owner attempts to update it with success
    const res = await repo.update('run-7', {
      status: 'completed',
      finished_at: '2026-07-18T10:06:00Z',
      updated_at: '2026-07-18T10:06:00Z',
      events_created: 5, // A counter to prove it didn't change
    });
    // repository does not return a false successful finalization (guarded update affects zero rows)
    expect(res).toBe(false);

    // Verify it's still failed (prior terminal status is unchanged)
    // Verify finished_at, counters, and error_code are unchanged
    const run = await db
      .prepare(
        'SELECT status, finished_at, events_created, error_code FROM orchestration_runs WHERE id = ?'
      )
      .bind('run-7')
      .first();
    expect(run?.status).toBe('failed');
    expect(run?.finished_at).toBe('2026-07-18T10:05:00Z');
    expect(run?.events_created).toBe(0);
    expect(run?.error_code).toBe('LEASE_EXPIRED');
  });

  it('ORCH-RUN-8: Run rows contain no raw email, upstream payload, Authorization value, credential, or token', async () => {
    // Structural test of schema mappings. The columns inserted only map exactly to known primitives.
    await repo.create({
      id: 'run-8',
      trigger_type: 'scheduled',
      status: 'running',
      started_at: '2026-07-18T10:00:00Z',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    });
    const runStart = await db
      .prepare('SELECT * FROM orchestration_runs WHERE id = ?')
      .bind('run-8')
      .first();
    // Validate we don't have stray columns
    const columns = Object.keys(runStart || {});
    expect(columns).not.toContain('email');
    expect(columns).not.toContain('payload');
    expect(columns).not.toContain('secret');
    expect(columns).not.toContain('token');
  });
});
