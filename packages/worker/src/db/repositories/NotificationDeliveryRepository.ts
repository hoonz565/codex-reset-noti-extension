import { NotificationDeliveryRow, mapNotificationDeliveryRow } from '../schema';

export interface CreateDeliveryParams {
  id: string;
  event_id: string;
  subscriber_id: string;
  channel: string;
  state: string;
  created_at: string;
}

export type CreateResult = 'inserted' | 'already_exists' | 'error';

export type ClaimResult =
  | { outcome: 'claimed'; processingToken: string }
  | { outcome: 'not_due' }
  | { outcome: 'already_claimed' }
  | { outcome: 'terminal' }
  | { outcome: 'not_found' }
  | { outcome: 'failed' };

export type FinalizationResult =
  | { outcome: 'success' }
  | { outcome: 'stale_claim' }
  | { outcome: 'not_found' }
  | { outcome: 'failed' };

export class NotificationDeliveryRepository {
  constructor(private db: D1Database) {}

  async createIfAbsent(params: CreateDeliveryParams): Promise<{ result: CreateResult }> {
    try {
      const stmt = this.db
        .prepare(
          `
        INSERT INTO notification_deliveries (
          id, event_id, subscriber_id, channel, state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id, subscriber_id, channel) DO NOTHING
      `
        )
        .bind(
          params.id,
          params.event_id,
          params.subscriber_id,
          params.channel,
          params.state,
          params.created_at,
          params.created_at
        );

      const res = await stmt.run();
      if (res.meta.changes === 0) {
        return { result: 'already_exists' };
      }
      return { result: 'inserted' };
    } catch {
      return { result: 'error' };
    }
  }

  async findById(id: string) {
    const stmt = this.db.prepare(`SELECT * FROM notification_deliveries WHERE id = ?`).bind(id);
    const row = await stmt.first<NotificationDeliveryRow>();
    return row ? mapNotificationDeliveryRow(row) : null;
  }

  async listDuePending(nowIso: string, limit: number = 50) {
    const stmt = this.db
      .prepare(
        `
      SELECT * FROM notification_deliveries 
      WHERE state = 'pending' 
         AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY created_at ASC
      LIMIT ?
    `
      )
      .bind(nowIso, limit);
    const { results } = await stmt.all<NotificationDeliveryRow>();
    return results.map(mapNotificationDeliveryRow);
  }

  async listStaleProcessing(cutoffIso: string, limit: number = 100) {
    const stmt = this.db
      .prepare(
        `
      SELECT * FROM notification_deliveries 
      WHERE state = 'processing' 
        AND processing_started_at IS NOT NULL
        AND processing_started_at < ?
      LIMIT ?
    `
      )
      .bind(cutoffIso, limit);
    const { results } = await stmt.all<NotificationDeliveryRow>();
    return results.map(mapNotificationDeliveryRow);
  }

  async claimForProcessing(
    id: string,
    processingToken: string,
    processingStartedAt: string,
    updatedAt: string,
    nowIso: string
  ): Promise<ClaimResult> {
    try {
      const stmt = this.db
        .prepare(
          `
        UPDATE notification_deliveries 
        SET state = 'processing', 
            processing_token = ?, 
            processing_started_at = ?,
            attempt_count = attempt_count + 1,
            updated_at = ?
        WHERE id = ? 
          AND state = 'pending' 
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      `
        )
        .bind(processingToken, processingStartedAt, updatedAt, id, nowIso);

      const res = await stmt.run();
      if (res.meta.changes > 0) {
        return { outcome: 'claimed', processingToken };
      }

      // If zero rows, classify the reason
      const row = await this.findById(id);
      if (!row) return { outcome: 'not_found' };

      if (row.state === 'processing') return { outcome: 'already_claimed' };
      if (
        row.state === 'sent_to_provider' ||
        row.state === 'failed_permanent' ||
        row.state === 'cancelled'
      ) {
        return { outcome: 'terminal' };
      }

      return { outcome: 'not_due' };
    } catch {
      return { outcome: 'failed' };
    }
  }

  async markSentToProvider(
    id: string,
    processingToken: string,
    providerMessageId: string | null,
    updatedAt: string
  ): Promise<FinalizationResult> {
    try {
      const stmt = this.db
        .prepare(
          `
        UPDATE notification_deliveries 
        SET state = 'sent_to_provider', 
            provider_message_id = ?, 
            processing_token = NULL,
            processing_started_at = NULL,
            updated_at = ?
        WHERE id = ? AND state = 'processing' AND processing_token = ?
      `
        )
        .bind(providerMessageId, updatedAt, id, processingToken);

      const res = await stmt.run();
      if (res.meta.changes > 0) return { outcome: 'success' };

      const row = await this.findById(id);
      if (!row) return { outcome: 'not_found' };
      return { outcome: 'stale_claim' };
    } catch {
      return { outcome: 'failed' };
    }
  }

  async markRetryableFailure(
    id: string,
    processingToken: string,
    errorCode: string,
    errorMessage: string,
    nextAttemptAt: string,
    updatedAt: string
  ): Promise<FinalizationResult> {
    try {
      const stmt = this.db
        .prepare(
          `
        UPDATE notification_deliveries 
        SET state = 'pending', 
            last_error_code = ?, 
            last_error_message = ?, 
            next_attempt_at = ?, 
            processing_token = NULL,
            processing_started_at = NULL,
            updated_at = ?
        WHERE id = ? AND state = 'processing' AND processing_token = ?
      `
        )
        .bind(errorCode, errorMessage, nextAttemptAt, updatedAt, id, processingToken);

      const res = await stmt.run();
      if (res.meta.changes > 0) return { outcome: 'success' };

      const row = await this.findById(id);
      if (!row) return { outcome: 'not_found' };
      return { outcome: 'stale_claim' };
    } catch {
      return { outcome: 'failed' };
    }
  }

  async markPermanentFailure(
    id: string,
    processingToken: string,
    errorCode: string,
    errorMessage: string,
    updatedAt: string
  ): Promise<FinalizationResult> {
    try {
      const stmt = this.db
        .prepare(
          `
        UPDATE notification_deliveries 
        SET state = 'failed_permanent', 
            last_error_code = ?, 
            last_error_message = ?, 
            processing_token = NULL,
            processing_started_at = NULL,
            updated_at = ?
        WHERE id = ? AND state = 'processing' AND processing_token = ?
      `
        )
        .bind(errorCode, errorMessage, updatedAt, id, processingToken);

      const res = await stmt.run();
      if (res.meta.changes > 0) return { outcome: 'success' };

      const row = await this.findById(id);
      if (!row) return { outcome: 'not_found' };
      return { outcome: 'stale_claim' };
    } catch {
      return { outcome: 'failed' };
    }
  }

  async markCancelled(
    id: string,
    processingToken: string,
    errorCode: string,
    errorMessage: string,
    updatedAt: string
  ): Promise<FinalizationResult> {
    try {
      const stmt = this.db
        .prepare(
          `
        UPDATE notification_deliveries 
        SET state = 'cancelled', 
            last_error_code = ?, 
            last_error_message = ?, 
            processing_token = NULL,
            processing_started_at = NULL,
            updated_at = ?
        WHERE id = ? AND state = 'processing' AND processing_token = ?
      `
        )
        .bind(errorCode, errorMessage, updatedAt, id, processingToken);

      const res = await stmt.run();
      if (res.meta.changes > 0) return { outcome: 'success' };

      const row = await this.findById(id);
      if (!row) return { outcome: 'not_found' };
      return { outcome: 'stale_claim' };
    } catch {
      return { outcome: 'failed' };
    }
  }

  async recoverStaleClaim(
    id: string,
    staleProcessingToken: string,
    nextAttemptAt: string,
    updatedAt: string
  ): Promise<FinalizationResult> {
    try {
      const stmt = this.db
        .prepare(
          `
        UPDATE notification_deliveries 
        SET state = 'pending', 
            next_attempt_at = ?,
            processing_token = NULL,
            processing_started_at = NULL,
            updated_at = ?
        WHERE id = ? AND state = 'processing' AND processing_token = ?
      `
        )
        .bind(nextAttemptAt, updatedAt, id, staleProcessingToken);

      const res = await stmt.run();
      if (res.meta.changes > 0) return { outcome: 'success' };

      const row = await this.findById(id);
      if (!row) return { outcome: 'not_found' };
      return { outcome: 'stale_claim' };
    } catch {
      return { outcome: 'failed' };
    }
  }
}
