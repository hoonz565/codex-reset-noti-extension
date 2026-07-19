export interface MetricsWindowParams {
  startAt: string;
  endAt: string;
}

export interface OrchestrationMetricsData {
  total: number;
  completed: number;
  completedWithErrors: number;
  failed: number;
  skippedOverlap: number;
  latestStatus: 'completed' | 'completed_with_errors' | 'skipped_overlap' | 'failed' | null;
  latestFinishedAt: string | null;
}

export interface SourceMetricsData {
  latestOutcome:
    | 'fresh_snapshot_persisted'
    | 'unchanged_snapshot_persisted'
    | 'unavailable_snapshot_persisted'
    | 'source_request_failed'
    | 'source_validation_failed'
    | null;
  latestHealth: 'healthy' | 'degraded' | 'unavailable' | null;
  latestCheckedAt: string | null;
  latestTrustedObservedAt: string | null;
}

export interface EventsMetricsData {
  probabilityReached70: number;
  resetAnnounced: number;
}

export interface DeliveriesMetricsData {
  pending: number;
  duePending: number;
  processing: number;
  staleProcessing: number;
  sentToProvider: number;
  failedPermanent: number;
  cancelled: number;
}
