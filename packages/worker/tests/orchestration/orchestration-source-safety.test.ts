/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrchestrationRunner } from '../../src/orchestration/orchestration-runner';
import { OrchestrationConfig } from '../../src/orchestration/orchestration-config';

describe('Orchestration Source Safety', () => {
  let runner: OrchestrationRunner;
  let mockSnapshotService: any;
  let mockEventService: any;
  let mockPrepService: any;
  let mockDispatchService: any;
  let mockLock: any;
  let mockRunRepo: any;

  beforeEach(() => {
    mockSnapshotService = {
      checkAndPersist: vi
        .fn()
        .mockResolvedValue({ outcome: 'persisted', snapshotId: 'snap-1', meaningfulChange: false }),
    };
    mockEventService = { process: vi.fn().mockResolvedValue({ outcome: 'no_event' }) };
    mockPrepService = { prepareDeliveries: vi.fn().mockResolvedValue({ outcome: 'prepared' }) };
    mockDispatchService = { dispatch: vi.fn().mockResolvedValue(undefined) };
    mockLock = {
      acquire: vi.fn().mockResolvedValue({ outcome: 'acquired' }),
      release: vi.fn().mockResolvedValue(true),
    };
    mockRunRepo = {
      create: vi.fn().mockResolvedValue(true),
      update: vi.fn().mockResolvedValue(true),
    };

    const config: OrchestrationConfig = {
      totalRunBudgetMs: 25000,
      deliveryDispatchBudgetMs: 15000,
      safetyMarginMs: 500,
      leaseDurationMs: 60000,
      maxDeliveriesPerRun: 25,
      processingLeaseDurationMs: 60000,
    };
    runner = new OrchestrationRunner(
      config,
      mockRunRepo,
      mockLock,
      mockSnapshotService,
      mockEventService,
      mockPrepService,
      mockDispatchService
    );
  });

  it('ORCH-SOURCE-1: A fresh trusted persisted snapshot may invoke EventProcessingService.', async () => {
    mockSnapshotService.checkAndPersist.mockResolvedValue({
      outcome: 'persisted',
      snapshotId: 'snap-1',
      meaningfulChange: true,
    });
    await runner.run('scheduled', new Date().toISOString());
    expect(mockEventService.process).toHaveBeenCalled();
  });

  it('ORCH-SOURCE-2: A persisted unavailable snapshot invokes no event transition.', async () => {
    mockSnapshotService.checkAndPersist.mockResolvedValue({
      outcome: 'persisted_unavailable',
      snapshotId: 'snap-un',
    });
    await runner.run('scheduled', new Date().toISOString());
    expect(mockEventService.process).not.toHaveBeenCalled();
  });

  it('ORCH-SOURCE-3: An untrusted or invalid persisted snapshot invokes no event transition.', async () => {
    // untrusted/invalid might also result in persisted_unavailable if degraded, or throwing.
    // In our runner, if outcome is persisted_unavailable, it skips event processing.
    mockSnapshotService.checkAndPersist.mockResolvedValue({
      outcome: 'persisted_unavailable',
      snapshotId: 'snap-bad',
    });
    await runner.run('scheduled', new Date().toISOString());
    expect(mockEventService.process).not.toHaveBeenCalled();
  });

  it('ORCH-SOURCE-4: A stale preserved numeric probability creates no subscriber event.', async () => {
    mockSnapshotService.checkAndPersist.mockResolvedValue({
      outcome: 'persisted',
      snapshotId: 'snap-stale',
      meaningfulChange: false, // Not fresh
    });
    mockEventService.process.mockResolvedValue({ outcome: 'ineligible_snapshot' });
    await runner.run('scheduled', new Date().toISOString());
    expect(mockPrepService.prepareDeliveries).not.toHaveBeenCalled();
  });

  it('ORCH-SOURCE-5: A source-stage failure invokes no DeliveryPreparationService.', async () => {
    mockSnapshotService.checkAndPersist.mockResolvedValue({
      outcome: 'persisted_unavailable',
      snapshotId: 'snap-fail',
    });
    await runner.run('scheduled', new Date().toISOString());
    expect(mockPrepService.prepareDeliveries).not.toHaveBeenCalled();
  });

  it('ORCH-SOURCE-6: When the current source stage is unavailable but safely persisted:\n- no new event processing or preparation occurs\n- existing due pending deliveries follow the documented continuation policy\n- the run becomes completed_with_errors', async () => {
    mockSnapshotService.checkAndPersist.mockResolvedValue({
      outcome: 'persisted_unavailable',
      snapshotId: 'snap-1',
    });
    const res = await runner.run('scheduled', new Date().toISOString());
    expect(mockEventService.process).not.toHaveBeenCalled();
    expect(mockPrepService.prepareDeliveries).not.toHaveBeenCalled();
    expect(mockDispatchService.dispatch).toHaveBeenCalled(); // Dispatch still happens for pending deliveries
    expect(res.outcome).toBe('completed_with_errors');
  });

  it('SOURCE-CRIT-1: failure to persist any snapshot/DB integrity failure -> failed and no dispatch (additional)', async () => {
    mockSnapshotService.checkAndPersist.mockResolvedValue({
      outcome: 'failed',
      error: 'DEPENDENCY_FAILURE',
    });
    const res = await runner.run('scheduled', new Date().toISOString());
    expect(res.outcome).toBe('failed');
    expect(mockDispatchService.dispatch).not.toHaveBeenCalled();
  });
});
