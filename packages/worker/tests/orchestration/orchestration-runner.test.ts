import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrchestrationRunner } from '../../src/orchestration/orchestration-runner';
import { setupTestDb } from '../db/test-utils';
import { OrchestrationConfig } from '../../src/orchestration/orchestration-config';
import { OrchestrationRunRepository } from '../../src/db/repositories/OrchestrationRunRepository';
import { OrchestrationLockRepository } from '../../src/db/repositories/OrchestrationLockRepository';
import { OrchestrationLock } from '../../src/orchestration/orchestration-lock';

describe('OrchestrationRunner', () => {
  let db: D1Database;
  let runRepo: OrchestrationRunRepository;
  let lock: OrchestrationLock;
  let runner: OrchestrationRunner;
  let mockSnapshotService: any;
  let mockEventService: any;
  let mockPrepService: any;
  let mockDispatchService: any;
  const config: OrchestrationConfig = {
    totalRunBudgetMs: 25000,
    deliveryDispatchBudgetMs: 15000,
    safetyMarginMs: 500,
    leaseDurationMs: 60000,
    maxDeliveriesPerRun: 25,
    processingLeaseDurationMs: 60000,
  };

  beforeEach(async () => {
    db = await setupTestDb();
    runRepo = new OrchestrationRunRepository(db);
    lock = new OrchestrationLock(new OrchestrationLockRepository(db), runRepo);

    mockSnapshotService = {
      checkAndPersist: vi.fn().mockImplementation(async () => {
        await db.prepare('INSERT INTO reset_cycles (id, anchor_reset_at, state, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT DO NOTHING')
          .bind('cycle-1', '2026-07-18T00:00:00Z', 'active', '2026-07-18T00:00:00Z').run();
        await db.prepare('INSERT INTO source_snapshots (id, reset_cycle_id, probability, lifecycle, source_health, source_updated_at, checked_at, payload_hash, meaningful_change, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)')
          .bind('snap-1', 'cycle-1', 50, 'none', 'healthy', '2026-07-18T10:00:00Z', '2026-07-18T10:00:00Z', 'hash', 0, '2026-07-18T10:00:00Z')
          .run();
        return { outcome: 'persisted', snapshotId: 'snap-1', meaningfulChange: false };
      }),
    };
    mockEventService = {
      process: vi.fn().mockResolvedValue({ outcome: 'no_event' }),
    };
    mockPrepService = {
      prepareDeliveries: vi.fn().mockResolvedValue({ outcome: 'prepared' }),
    };
    mockDispatchService = {
      dispatch: vi.fn().mockResolvedValue(undefined),
    };

    runner = new OrchestrationRunner(
      config,
      runRepo,
      lock,
      mockSnapshotService,
      mockEventService,
      mockPrepService,
      mockDispatchService
    );
  });

  it('ORCH-10: successfully completes a run when source is unchanged', async () => {
    const res = await runner.run('scheduled', new Date().toISOString());
    if (res.outcome === 'failed') {
      console.error('Run failed with error:', (res as any).error);
    }
    expect(res.outcome).toBe('completed');
    if (res.outcome === 'completed') {
      expect(res.summary.sourceOutcome).toBe('unchanged_snapshot_persisted');
      expect(res.summary.eventsCreated).toBe(0);
    }
    
    // Verify run is persisted as completed
    const runs = (await db.prepare('SELECT * FROM orchestration_runs ORDER BY created_at DESC LIMIT 10').all()).results as any[];
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe('completed');
  });

  it('ORCH-11: skips overlap when lock is already acquired', async () => {
    await lock.acquire('run-1', new Date().toISOString(), new Date(Date.now() + 60000).toISOString());
    const res = await runner.run('scheduled', new Date().toISOString());
    expect(res.outcome).toBe('skipped_overlap');

    // Verify skipped_overlap run is persisted
    const runs = (await db.prepare('SELECT * FROM orchestration_runs ORDER BY created_at DESC LIMIT 10').all()).results as any[];
    expect(runs.length).toBe(1); // The second run was inserted as skipped_overlap
    expect(runs[0].status).toBe('skipped_overlap');
  });

  it('ORCH-12: recovers stale lease automatically', async () => {
    // Acquire lock and expire it
    await lock.acquire('stale-run', new Date().toISOString(), new Date(Date.now() - 60000).toISOString());
    // Persist stale run
    await runRepo.create({
      id: 'stale-run',
      trigger_type: 'scheduled',
      status: 'running',
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const res = await runner.run('scheduled', new Date().toISOString());
    if (res.outcome === 'failed') {
      console.error('Run failed with error:', (res as any).error);
    }
    expect(res.outcome).toBe('completed');

    // Verify the stale run was marked failed
    const staleRunRow = (await db.prepare('SELECT status FROM orchestration_runs WHERE id = ?').bind('stale-run').first()) as any;
    expect(staleRunRow.status).toBe('failed');
  });
});
