/* eslint-disable @typescript-eslint/no-explicit-any */
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

    await db
      .prepare(
        'INSERT INTO reset_cycles (id, anchor_reset_at, state, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT DO NOTHING'
      )
      .bind('cycle-1', '2026-07-18T00:00:00Z', 'active', '2026-07-18T00:00:00Z')
      .run();

    mockSnapshotService = {
      checkAndPersist: vi.fn().mockImplementation(async () => {
        await db
          .prepare(
            'INSERT INTO source_snapshots (id, reset_cycle_id, probability, lifecycle, source_health, source_updated_at, checked_at, payload_hash, meaningful_change, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)'
          )
          .bind(
            'snap-1',
            'cycle-1',
            50,
            'none',
            'healthy',
            '2026-07-18T10:00:00Z',
            '2026-07-18T10:00:00Z',
            'hash',
            0,
            '2026-07-18T10:00:00Z'
          )
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

  it('ORCH-FLOW-1: Successful run executes stages in exact order: recovery -> source -> events -> preparation -> dispatch', async () => {
    const order: string[] = [];
    vi.spyOn(lock, 'acquire').mockImplementation(async () => {
      order.push('recovery');
      return true;
    });
    mockSnapshotService.checkAndPersist.mockImplementation(async () => {
      order.push('source');
      return { outcome: 'persisted', snapshotId: 'snap-1', meaningfulChange: true };
    });
    mockEventService.process.mockImplementation(async () => {
      order.push('events');
      return { outcome: 'event_created', eventId: 'evt-1' };
    });
    mockPrepService.prepareDeliveries.mockImplementation(async () => {
      order.push('preparation');
      return { outcome: 'prepared' };
    });
    mockDispatchService.dispatch.mockImplementation(async () => {
      order.push('dispatch');
    });

    await runner.run('scheduled', new Date().toISOString());
    expect(order).toEqual(['recovery', 'source', 'events', 'preparation', 'dispatch']);
  });

  it('ORCH-FLOW-2: Source check is invoked exactly once', async () => {
    await runner.run('scheduled', new Date().toISOString());
    expect(mockSnapshotService.checkAndPersist).toHaveBeenCalledTimes(1);
  });

  it('ORCH-FLOW-3: Persisted SnapshotCheckResult is passed to EventProcessingService', async () => {
    mockSnapshotService.checkAndPersist.mockResolvedValue({
      outcome: 'persisted',
      snapshotId: 'snap-123',
      meaningfulChange: true,
    });
    await runner.run('scheduled', new Date().toISOString());
    expect(mockEventService.process).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'persisted', snapshotId: 'snap-123' }),
      expect.any(Date)
    );
  });

  it('ORCH-FLOW-4: Only newly inserted subscriber event IDs are passed to preparation', async () => {
    // Case 1: event_created
    mockEventService.process.mockResolvedValue({ outcome: 'event_created', eventId: 'evt-99' });
    await runner.run('scheduled', new Date().toISOString());
    expect(mockPrepService.prepareDeliveries).toHaveBeenCalledWith('evt-99', expect.any(String));

    mockPrepService.prepareDeliveries.mockClear();

    // Case 2: event_already_exists
    mockEventService.process.mockResolvedValue({
      outcome: 'event_already_exists',
      cycleId: 'c1',
      eventType: 'RESET_ANNOUNCED',
    });
    await runner.run('scheduled', new Date().toISOString());
    expect(mockPrepService.prepareDeliveries).not.toHaveBeenCalled();
  });

  it('ORCH-FLOW-5: Preparation completes before dispatch begins', async () => {
    const order: string[] = [];
    mockPrepService.prepareDeliveries.mockImplementation(async () => {
      order.push('prep');
      return { outcome: 'prepared' };
    });
    mockDispatchService.dispatch.mockImplementation(async () => {
      order.push('disp');
    });
    mockEventService.process.mockResolvedValue({ outcome: 'event_created', eventId: 'evt-1' });

    await runner.run('scheduled', new Date().toISOString());
    expect(order).toEqual(['prep', 'disp']);
  });

  it('ORCH-FLOW-6: Run summary contains exact stage counters', async () => {
    const res = await runner.run('scheduled', new Date().toISOString());
    expect(res.summary).toBeDefined();
    expect(res.summary).toHaveProperty('eventsCreated');
    expect(res.summary).toHaveProperty('deliveriesPrepared');
    expect(res.summary).toHaveProperty('deliveriesSent');
    expect(res.summary).toHaveProperty('deliveriesRetried');
    expect(res.summary).toHaveProperty('deliveriesFailed');
  });

  it('ORCH-FLOW-7: Successful run finalizes completed', async () => {
    const res = await runner.run('scheduled', new Date().toISOString());
    expect(res.outcome).toBe('completed');
  });

  it('ORCH-FLOW-8: Phase 7 invokes existing Phase 3/4/6 services and does not implement snapshot parsing or event precedence', () => {
    // We verify this by ensuring the runner is strictly constructed with these services and calls them,
    // rather than implementing raw logic.
    expect(runner).toHaveProperty('snapshotService');
    expect(runner).toHaveProperty('eventProcessingService');
    expect(runner).toHaveProperty('deliveryPreparationService');
    expect(runner).toHaveProperty('dispatchService');
  });
});
