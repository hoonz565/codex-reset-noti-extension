/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  MetricsWindowParams,
  OrchestrationMetricsData,
  SourceMetricsData,
  EventsMetricsData,
  DeliveriesMetricsData,
} from './metrics-types';

export interface MetricsRepository {
  getOrchestrationMetrics(window: MetricsWindowParams): Promise<OrchestrationMetricsData>;
  getSourceMetrics(): Promise<SourceMetricsData>;
  getEventsMetrics(window: MetricsWindowParams): Promise<EventsMetricsData>;
  getDeliveriesMetrics(now: Date): Promise<DeliveriesMetricsData>;
}

export class D1MetricsRepository implements MetricsRepository {
  constructor(private db: D1Database) {}

  async getOrchestrationMetrics(window: MetricsWindowParams): Promise<OrchestrationMetricsData> {
    const stmt = this.db
      .prepare(
        `SELECT status, count(*) as count 
         FROM orchestration_runs 
         WHERE started_at >= ? AND started_at <= ? 
         GROUP BY status`
      )
      .bind(window.startAt, window.endAt);

    const { results } = await stmt.all<{ status: string; count: number }>();

    let completed = 0;
    let completedWithErrors = 0;
    let failed = 0;
    let skippedOverlap = 0;
    let total = 0;

    for (const row of results) {
      total += row.count;
      switch (row.status) {
        case 'completed':
          completed += row.count;
          break;
        case 'completed_with_errors':
          completedWithErrors += row.count;
          break;
        case 'failed':
          failed += row.count;
          break;
        case 'skipped_overlap':
          skippedOverlap += row.count;
          break;
      }
    }

    const latestStmt = this.db.prepare(
      `SELECT status, finished_at 
       FROM orchestration_runs 
       WHERE status IN ('completed', 'completed_with_errors', 'skipped_overlap', 'failed') 
       ORDER BY started_at DESC LIMIT 1`
    );
    const latestRow = await latestStmt.first<{ status: string; finished_at: string | null }>();

    return {
      total,
      completed,
      completedWithErrors,
      failed,
      skippedOverlap,
      latestStatus: (latestRow?.status as any) || null,
      latestFinishedAt: latestRow?.finished_at || null,
    };
  }

  async getSourceMetrics(): Promise<SourceMetricsData> {
    const latestRunStmt = this.db.prepare(
      `SELECT source_outcome 
       FROM orchestration_runs 
       WHERE source_outcome IS NOT NULL 
       ORDER BY started_at DESC LIMIT 1`
    );
    const latestRunRow = await latestRunStmt.first<{ source_outcome: string }>();

    const latestSnapshotStmt = this.db.prepare(
      `SELECT source_health, checked_at 
       FROM source_snapshots 
       ORDER BY created_at DESC LIMIT 1`
    );
    const latestSnapshotRow = await latestSnapshotStmt.first<{
      source_health: string;
      checked_at: string;
    }>();

    const latestTrustedSnapshotStmt = this.db.prepare(
      `SELECT checked_at 
       FROM source_snapshots 
       WHERE source_health IN ('healthy', 'degraded') AND probability IS NOT NULL 
       ORDER BY created_at DESC LIMIT 1`
    );
    const latestTrustedRow = await latestTrustedSnapshotStmt.first<{ checked_at: string }>();

    return {
      latestOutcome: (latestRunRow?.source_outcome as any) || null,
      latestHealth: (latestSnapshotRow?.source_health as any) || null,
      latestCheckedAt: latestSnapshotRow?.checked_at || null,
      latestTrustedObservedAt: latestTrustedRow?.checked_at || null,
    };
  }

  async getEventsMetrics(window: MetricsWindowParams): Promise<EventsMetricsData> {
    const stmt = this.db
      .prepare(
        `SELECT type, count(*) as count 
         FROM reset_events 
         WHERE created_at >= ? AND created_at <= ? 
         GROUP BY type`
      )
      .bind(window.startAt, window.endAt);

    const { results } = await stmt.all<{ type: string; count: number }>();

    let probabilityReached70 = 0;
    let resetAnnounced = 0;

    for (const row of results) {
      if (row.type === 'PROBABILITY_REACHED_70') {
        probabilityReached70 += row.count;
      } else if (row.type === 'RESET_ANNOUNCED') {
        resetAnnounced += row.count;
      }
    }

    return {
      probabilityReached70,
      resetAnnounced,
    };
  }

  async getDeliveriesMetrics(now: Date): Promise<DeliveriesMetricsData> {
    // pending due
    const dueStmt = this.db
      .prepare(
        `SELECT count(*) as count FROM notification_deliveries WHERE state = 'pending' AND next_attempt_at <= ?`
      )
      .bind(now.toISOString());
    const dueRow = await dueStmt.first<{ count: number }>();
    const duePending = dueRow?.count || 0;

    // stale processing (threshold DELIVERY_PROCESSING_LEASE_SECONDS is handled in the query)
    const thresholdDate = new Date(now.getTime() - 300 * 1000).toISOString(); // 5 minutes
    const staleStmt = this.db
      .prepare(
        `SELECT count(*) as count FROM notification_deliveries WHERE state = 'processing' AND processing_started_at < ?`
      )
      .bind(thresholdDate);
    const staleRow = await staleStmt.first<{ count: number }>();
    const staleProcessing = staleRow?.count || 0;

    // overall state counts
    const stateStmt = this.db.prepare(
      `SELECT state, count(*) as count FROM notification_deliveries GROUP BY state`
    );
    const { results } = await stateStmt.all<{ state: string; count: number }>();

    let pending = 0;
    let processing = 0;
    let sentToProvider = 0;
    let failedPermanent = 0;
    let cancelled = 0;

    for (const row of results) {
      switch (row.state) {
        case 'pending':
          pending += row.count;
          break;
        case 'processing':
          processing += row.count;
          break;
        case 'sent_to_provider':
          sentToProvider += row.count;
          break;
        case 'failed_permanent':
          failedPermanent += row.count;
          break;
        case 'cancelled':
          cancelled += row.count;
          break;
      }
    }

    return {
      pending,
      duePending,
      processing,
      staleProcessing,
      sentToProvider,
      failedPermanent,
      cancelled,
    };
  }
}
