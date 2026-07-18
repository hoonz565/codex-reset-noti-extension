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

  async listPending(limit: number = 50) {
    // Pending means state='pending' or (state='failed_retryable' and next_attempt_at <= now).
    // For simplicity of MVP query, we can just grab them and filter if needed,
    // or use a smart query.
    const now = new Date().toISOString();
    const stmt = this.db
      .prepare(
        `
      SELECT * FROM notification_deliveries 
      WHERE state = 'pending' OR (state = 'failed_retryable' AND next_attempt_at <= ?)
      ORDER BY created_at ASC
      LIMIT ?
    `
      )
      .bind(now, limit);
    const { results } = await stmt.all<NotificationDeliveryRow>();
    return results.map(mapNotificationDeliveryRow);
  }

  async claimForProcessing(id: string, updated_at: string) {
    // Only claim if it's currently pending or failed_retryable
    const stmt = this.db
      .prepare(
        `
      UPDATE notification_deliveries 
      SET state = 'processing', updated_at = ?
      WHERE id = ? AND state IN ('pending', 'failed_retryable')
    `
      )
      .bind(updated_at, id);
    const res = await stmt.run();
    return res.meta.changes > 0;
  }

  async markSentToProvider(id: string, provider_message_id: string, updated_at: string) {
    const stmt = this.db
      .prepare(
        `
      UPDATE notification_deliveries 
      SET state = 'sent_to_provider', provider_message_id = ?, updated_at = ?
      WHERE id = ? AND state = 'processing'
    `
      )
      .bind(provider_message_id, updated_at, id);
    await stmt.run();
  }

  async markRetryableFailure(
    id: string,
    errorCode: string,
    errorMessage: string,
    nextAttemptAt: string,
    updated_at: string
  ) {
    const stmt = this.db
      .prepare(
        `
      UPDATE notification_deliveries 
      SET state = 'failed_retryable', last_error_code = ?, last_error_message = ?, next_attempt_at = ?, attempt_count = attempt_count + 1, updated_at = ?
      WHERE id = ? AND state = 'processing'
    `
      )
      .bind(errorCode, errorMessage, nextAttemptAt, updated_at, id);
    await stmt.run();
  }

  async markPermanentFailure(
    id: string,
    errorCode: string,
    errorMessage: string,
    updated_at: string
  ) {
    const stmt = this.db
      .prepare(
        `
      UPDATE notification_deliveries 
      SET state = 'failed_permanent', last_error_code = ?, last_error_message = ?, attempt_count = attempt_count + 1, updated_at = ?
      WHERE id = ? AND state = 'processing'
    `
      )
      .bind(errorCode, errorMessage, updated_at, id);
    await stmt.run();
  }

  async releaseStuckProcessing(id: string, updated_at: string) {
    // Reverts processing back to pending if stuck
    const stmt = this.db
      .prepare(
        `
      UPDATE notification_deliveries 
      SET state = 'pending', updated_at = ?
      WHERE id = ? AND state = 'processing'
    `
      )
      .bind(updated_at, id);
    await stmt.run();
  }
}
