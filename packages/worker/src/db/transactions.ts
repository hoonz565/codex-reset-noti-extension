import { CreateSubscriberParams } from './repositories/SubscriberRepository';
import { CreateEventParams } from './repositories/ResetEventRepository';
import { CreateDeliveryParams } from './repositories/NotificationDeliveryRepository';
import { CreateCycleParams } from './repositories/ResetCycleRepository';
import { CreateAuditParams } from './repositories/AuditEventRepository';

export type CycleTransitionResult =
  | { outcome: 'transitioned'; oldCycleId: string; newCycleId: string }
  | { outcome: 'already_transitioned'; existingCycleId?: string }
  | { outcome: 'stale_precondition' };

export class DbTransactions {
  constructor(private db: D1Database) {}

  /**
   * Subscriber creation with token metadata.
   */
  async createSubscriberAtomically(params: CreateSubscriberParams) {
    // SubscriberRepository already uses ON CONFLICT DO NOTHING for simple creation.
    // If we need to also insert an audit event, we would do it here.
    const stmt1 = this.db
      .prepare(
        `
      INSERT INTO subscribers (
        id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(normalized_email) DO NOTHING
    `
      )
      .bind(
        params.id,
        params.email,
        params.normalized_email,
        params.state,
        params.notify_70 ? 1 : 0,
        params.notify_announced ? 1 : 0,
        params.management_token_hash,
        params.created_at,
        params.created_at
      );

    await this.db.batch([stmt1]);
  }

  /**
   * Subscriber-event insertion plus delivery-row creation.
   */
  async createSubscriberEventAndDelivery(
    eventParams: CreateEventParams,
    deliveryParams: CreateDeliveryParams
  ) {
    const eventStmt = this.db
      .prepare(
        `
      INSERT INTO reset_events (
        id, reset_cycle_id, type, threshold, previous_probability, current_probability, source_signal_id, source_snapshot_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(reset_cycle_id, type) DO NOTHING
    `
      )
      .bind(
        eventParams.id,
        eventParams.reset_cycle_id,
        eventParams.type,
        eventParams.threshold,
        eventParams.previous_probability,
        eventParams.current_probability,
        eventParams.source_signal_id,
        eventParams.source_snapshot_id,
        eventParams.created_at
      );

    const deliveryStmt = this.db
      .prepare(
        `
      INSERT INTO notification_deliveries (
        id, event_id, subscriber_id, channel, state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id, subscriber_id, channel) DO NOTHING
    `
      )
      .bind(
        deliveryParams.id,
        deliveryParams.event_id,
        deliveryParams.subscriber_id,
        deliveryParams.channel,
        deliveryParams.state,
        deliveryParams.created_at,
        deliveryParams.created_at
      );

    // If event already exists, delivery might still insert if it failed before,
    // but typically they are batched together.
    await this.db.batch([eventStmt, deliveryStmt]);
  }

  /**
   * Reset-cycle transition
   */
  async performCycleTransition(
    auditParams: CreateAuditParams,
    oldCycleId: string,
    markCompletedAt: string,
    newCycleParams: CreateCycleParams,
    snapshotId: string
  ): Promise<CycleTransitionResult> {
    const payloadJson = auditParams.payload ? JSON.stringify(auditParams.payload) : null;

    // To prevent partial commits when oldCycleId is no longer active without relying on meta.changes:
    // 1. We first UPDATE the old cycle to 'completed' with a specifically generated unique transition token.
    // 2. We execute the INSERTs with a WHERE EXISTS clause checking that the old cycle IS completed
    //    and HAS the unique transition token.
    // Two concurrent requests cannot share ownership accidentally because we use a random UUID,
    // ensuring the marker is uniquely generated once per transition attempt.
    const transitionToken = crypto.randomUUID();

    const updateOldCycleStmt = this.db
      .prepare(
        `
      UPDATE reset_cycles 
      SET state = 'completed', updated_at = ?, completed_at = ?, transition_token = ? 
      WHERE id = ? AND state = 'active'
        AND (SELECT reset_cycle_id FROM source_snapshots WHERE id = ?) = ?
    `
      )
      .bind(markCompletedAt, markCompletedAt, transitionToken, oldCycleId, snapshotId, oldCycleId);

    const wasOldUpdated = `(SELECT 1 FROM reset_cycles WHERE id = ? AND state = 'completed' AND transition_token = ?)`;

    const auditStmt = this.db
      .prepare(
        `
      INSERT INTO audit_events (
        id, type, deduplication_key, subject_type, subject_id, payload_json, created_at
      ) 
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS ${wasOldUpdated}
      ON CONFLICT(deduplication_key) DO NOTHING
    `
      )
      .bind(
        auditParams.id,
        auditParams.type,
        auditParams.deduplication_key,
        auditParams.subject_type,
        auditParams.subject_id,
        payloadJson,
        auditParams.created_at,
        oldCycleId,
        transitionToken
      );

    const insertNewCycleStmt = this.db
      .prepare(
        `
      INSERT INTO reset_cycles (id, anchor_reset_at, state, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?
      WHERE EXISTS ${wasOldUpdated}
      ON CONFLICT(id) DO NOTHING
    `
      )
      .bind(
        newCycleParams.id,
        newCycleParams.anchor_reset_at,
        newCycleParams.state,
        newCycleParams.created_at,
        newCycleParams.created_at,
        oldCycleId,
        transitionToken
      );

    const updateSnapshotStmt = this.db
      .prepare(
        `
      UPDATE source_snapshots 
      SET reset_cycle_id = ? 
      WHERE id = ? AND reset_cycle_id = ? AND EXISTS ${wasOldUpdated}
    `
      )
      .bind(newCycleParams.id, snapshotId, oldCycleId, oldCycleId, transitionToken);

    const res = await this.db.batch([
      updateOldCycleStmt,
      auditStmt,
      insertNewCycleStmt,
      updateSnapshotStmt,
    ]);

    if (res[0].meta.changes > 0) {
      // This attempt won the race and committed the cycle state change.
      // Verify the audit event was also written (deduplication_key must not collide with an unrelated audit row).
      if (res[1].meta.changes === 0) {
        // The audit INSERT wrote 0 rows: either it was silently suppressed by a deduplication_key collision
        // with an unrelated audit event, or another infrastructure issue. This is a database inconsistency.
        throw new Error(
          `Database inconsistency: cycle transition committed for ${oldCycleId} but audit event was not written (deduplication_key=${auditParams.deduplication_key})`
        );
      }
      return {
        outcome: 'transitioned',
        oldCycleId,
        newCycleId: newCycleParams.id,
      };
    }

    // The UPDATE affected 0 rows: the old cycle was not active.
    // Distinguish between:
    //   already_transitioned — the exact same transition previously committed
    //   stale_precondition   — some other transition happened, or the cycle never existed
    const checkCycleStmt = this.db
      .prepare(`SELECT state FROM reset_cycles WHERE id = ? AND anchor_reset_at = ?`)
      .bind(newCycleParams.id, newCycleParams.anchor_reset_at);

    const checkOldCycleStmt = this.db
      .prepare(
        `SELECT state FROM reset_cycles WHERE id = ? AND state IN ('completed', 'superseded')`
      )
      .bind(oldCycleId);

    const checkAuditStmt = this.db
      .prepare(`SELECT 1 FROM audit_events WHERE deduplication_key = ?`)
      .bind(auditParams.deduplication_key);

    const checks = await this.db.batch([checkCycleStmt, checkOldCycleStmt, checkAuditStmt]);

    const newCycleFound = checks[0].results.length > 0;
    const oldCycleCompleted = checks[1].results.length > 0;
    const auditEventFound = checks[2].results.length > 0;

    if (newCycleFound && oldCycleCompleted && auditEventFound) {
      // All three proofs present: the exact same transition was committed previously.
      return { outcome: 'already_transitioned' };
    }

    // Cannot prove the same transition ran — treat as a stale precondition.
    return { outcome: 'stale_precondition' };
  }
}
