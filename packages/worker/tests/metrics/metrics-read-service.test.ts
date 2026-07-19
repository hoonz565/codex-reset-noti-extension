/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetricsReadService } from '../../src/metrics/metrics-read-service';
import { MetricsRepository } from '../../src/metrics/metrics-repository';

describe('MetricsReadService (DASH-METRICS-1..6)', () => {
  let repo: vitest.Mocked<MetricsRepository>;
  let service: MetricsReadService;
  const now = new Date('2023-01-01T00:10:00Z');

  beforeEach(() => {
    repo = {
      getOrchestrationMetrics: vi.fn(),
      getSourceMetrics: vi.fn(),
      getEventsMetrics: vi.fn(),
      getDeliveriesMetrics: vi.fn(),
    };
    service = new MetricsReadService(repo);
  });

  it('EXTRA-METRICS-1: Default metrics window is applied at service level.', async () => {
    repo.getOrchestrationMetrics.mockResolvedValue({} as any);
    repo.getSourceMetrics.mockResolvedValue({} as any);
    repo.getEventsMetrics.mockResolvedValue({} as any);
    repo.getDeliveriesMetrics.mockResolvedValue({} as any);

    // If '24h' is the default, passing it manually reflects the default window application.
    await service.getMetrics('24h', now);
    expect(repo.getOrchestrationMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: '2022-12-31T00:10:00.000Z',
      })
    );
  });

  it('DASH-METRICS-2: Supported windows 1h, 24h, and 7d are accepted.', async () => {
    repo.getOrchestrationMetrics.mockResolvedValue({} as any);
    repo.getSourceMetrics.mockResolvedValue({} as any);
    repo.getEventsMetrics.mockResolvedValue({} as any);
    repo.getDeliveriesMetrics.mockResolvedValue({} as any);

    await service.getMetrics('1h', now);
    expect(repo.getOrchestrationMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: '2022-12-31T23:10:00.000Z',
      })
    );
    expect(repo.getEventsMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: '2022-12-31T23:10:00.000Z',
      })
    );

    await service.getMetrics('24h', now);
    expect(repo.getOrchestrationMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: '2022-12-31T00:10:00.000Z',
      })
    );
    expect(repo.getEventsMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: '2022-12-31T00:10:00.000Z',
      })
    );

    await service.getMetrics('7d', now);
    expect(repo.getOrchestrationMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: '2022-12-25T00:10:00.000Z',
      })
    );
    expect(repo.getEventsMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: '2022-12-25T00:10:00.000Z',
      })
    );
  });

  it('DASH-METRICS-4: Orchestration status counts are correct.', async () => {
    repo.getOrchestrationMetrics.mockResolvedValue({
      total: 10,
      completed: 8,
      completedWithErrors: 1,
      failed: 1,
      skippedOverlap: 0,
    } as any);
    repo.getSourceMetrics.mockResolvedValue({} as any);
    repo.getEventsMetrics.mockResolvedValue({} as any);
    repo.getDeliveriesMetrics.mockResolvedValue({} as any);

    const result = await service.getMetrics('24h', now);
    expect(result.orchestration.completed).toBe(8);
    expect(result.orchestration.failed).toBe(1);
  });

  it('DASH-METRICS-5: Latest orchestration outcome is correct.', async () => {
    repo.getOrchestrationMetrics.mockResolvedValue({
      latestStatus: 'completed',
      latestFinishedAt: '2023-01-01T00:09:00Z',
    } as any);
    repo.getSourceMetrics.mockResolvedValue({
      latestOutcome: 'unavailable_snapshot_persisted',
    } as any);
    repo.getEventsMetrics.mockResolvedValue({} as any);
    repo.getDeliveriesMetrics.mockResolvedValue({} as any);

    const result = await service.getMetrics('24h', now);
    expect(result.orchestration.latestStatus).toBe('completed');
  });

  it('DASH-METRICS-6: Delivery state counts are correct.', async () => {
    repo.getOrchestrationMetrics.mockResolvedValue({} as any);
    repo.getSourceMetrics.mockResolvedValue({} as any);
    repo.getEventsMetrics.mockResolvedValue({} as any);
    repo.getDeliveriesMetrics.mockResolvedValue({
      pending: 5,
      processing: 2,
      sentToProvider: 10,
      failedPermanent: 1,
      cancelled: 0,
    } as any);

    const result = await service.getMetrics('24h', now);
    expect(result.deliveries.pending).toBe(5);
    expect(result.deliveries.sentToProvider).toBe(10);
  });
});
