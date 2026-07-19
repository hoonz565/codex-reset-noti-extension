import { describe, it, expect } from 'vitest';
import { AdminMetricsResponseSchema } from '../src/metrics-schema';

describe('AdminMetricsResponseSchema', () => {
  it('validates a complete response correctly', () => {
    const data = {
      schemaVersion: 1,
      window: '24h',
      generatedAt: '2023-01-01T00:00:00Z',
      orchestration: {
        total: 10,
        completed: 8,
        completedWithErrors: 1,
        failed: 1,
        skippedOverlap: 0,
        latestStatus: 'completed',
        latestFinishedAt: '2023-01-01T00:00:00Z',
      },
      source: {
        latestOutcome: 'fresh_snapshot_persisted',
        latestHealth: 'healthy',
        latestCheckedAt: '2023-01-01T00:00:00Z',
        latestTrustedObservedAt: '2023-01-01T00:00:00Z',
        freshnessState: 'fresh',
      },
      events: {
        probabilityReached70: 1,
        resetAnnounced: 0,
      },
      deliveries: {
        pending: 0,
        duePending: 0,
        processing: 0,
        staleProcessing: 0,
        sentToProvider: 10,
        failedPermanent: 0,
        cancelled: 0,
      },
    };
    expect(AdminMetricsResponseSchema.parse(data)).toEqual(data);
  });
});
