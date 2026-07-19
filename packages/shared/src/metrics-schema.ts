import { z } from 'zod';

export const MetricsWindowSchema = z.enum(['1h', '24h', '7d']);
export type MetricsWindow = z.infer<typeof MetricsWindowSchema>;

export const AdminMetricsResponseSchema = z.object({
  schemaVersion: z.literal(1),
  window: MetricsWindowSchema,
  generatedAt: z.string(),
  orchestration: z.object({
    total: z.number(),
    completed: z.number(),
    completedWithErrors: z.number(),
    failed: z.number(),
    skippedOverlap: z.number(),
    latestStatus: z
      .enum(['completed', 'completed_with_errors', 'skipped_overlap', 'failed'])
      .nullable(),
    latestFinishedAt: z.string().nullable(),
  }),
  source: z.object({
    latestOutcome: z
      .enum([
        'fresh_snapshot_persisted',
        'unchanged_snapshot_persisted',
        'unavailable_snapshot_persisted',
        'source_request_failed',
        'source_validation_failed',
      ])
      .nullable(),
    latestHealth: z.enum(['healthy', 'degraded', 'unavailable']).nullable(),
    latestCheckedAt: z.string().nullable(),
    latestTrustedObservedAt: z.string().nullable(),
    freshnessState: z.enum(['fresh', 'stale', 'unavailable', 'empty']),
  }),
  events: z.object({
    probabilityReached70: z.number(),
    resetAnnounced: z.number(),
  }),
  deliveries: z.object({
    pending: z.number(),
    duePending: z.number(),
    processing: z.number(),
    staleProcessing: z.number(),
    sentToProvider: z.number(),
    failedPermanent: z.number(),
    cancelled: z.number(),
  }),
});

export type AdminMetricsResponse = z.infer<typeof AdminMetricsResponseSchema>;

export const AdminMetricsErrorSchema = z.object({
  error: z.string(),
});

export type AdminMetricsError = z.infer<typeof AdminMetricsErrorSchema>;
