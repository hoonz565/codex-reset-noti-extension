import { CreateEventParams } from './repositories/ResetEventRepository';
import { CreateDeliveryParams } from './repositories/NotificationDeliveryRepository';
import { CreateCycleParams } from './repositories/ResetCycleRepository';
import { CreateAuditParams } from './repositories/AuditEventRepository';
import { CreateSubscriptionTokenParams } from './repositories/SubscriptionTokenRepository';

export type CycleTransitionResult =
  | { outcome: 'transitioned'; oldCycleId: string; newCycleId: string }
  | { outcome: 'already_transitioned'; existingCycleId?: string }
  | { outcome: 'stale_precondition' };

export class DbTransactions {
  constructor(private db: D1Database) {}

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

  // ==================================================
  // PHASE 5: SUBSCRIPTION TRANSACTIONS
  // ==================================================

  /**
   * New subscriber request:
   * 1. Insert pending subscriber (DO NOTHING if exists)
   * 2. Insert confirm_subscription token
   * 3. Insert audit event
   */
  async createPendingSubscriptionTokens(
    subscriberId: string,
    tokenParams: CreateSubscriptionTokenParams,
    auditParams: CreateAuditParams
  ) {
    const payloadJson = auditParams.payload ? JSON.stringify(auditParams.payload) : null;

    const tokenStmt = this.db
      .prepare(
        `INSERT INTO subscription_tokens (
          id, subscriber_id, purpose, token_hash, 
          requested_probability70, requested_reset_announced, 
          created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        tokenParams.id,
        tokenParams.subscriber_id,
        tokenParams.purpose,
        tokenParams.token_hash,
        tokenParams.requested_probability70 === null
          ? null
          : tokenParams.requested_probability70
            ? 1
            : 0,
        tokenParams.requested_reset_announced === null
          ? null
          : tokenParams.requested_reset_announced
            ? 1
            : 0,
        tokenParams.created_at,
        tokenParams.expires_at
      );

    const auditStmt = this.db
      .prepare(
        `INSERT INTO audit_events (
          id, type, deduplication_key, subject_type, subject_id, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(deduplication_key) DO NOTHING`
      )
      .bind(
        auditParams.id,
        auditParams.type,
        auditParams.deduplication_key,
        auditParams.subject_type,
        auditParams.subject_id,
        payloadJson,
        auditParams.created_at
      );

    await this.db.batch([tokenStmt, auditStmt]);
  }

  /**
   * Resubmission (Active or Unsubscribed):
   * 1. Revoke existing confirm tokens
   * 2. Insert new confirm_subscription token
   * 3. Insert audit event
   */
  async prepareResubscription(
    subscriberId: string,
    tokenParams: CreateSubscriptionTokenParams,
    auditParams: CreateAuditParams,
    now: string,
    transitionToPending: boolean,
    expectedTokenVersion: number
  ) {
    const payloadJson = auditParams.payload ? JSON.stringify(auditParams.payload) : null;
    const revokeStmt = this.db
      .prepare(
        `UPDATE subscription_tokens SET revoked_at = ? 
         WHERE subscriber_id = ? AND purpose = 'confirm_subscription' AND consumed_at IS NULL AND revoked_at IS NULL`
      )
      .bind(now, subscriberId);

    const tokenStmt = this.db
      .prepare(
        `INSERT INTO subscription_tokens (
          id, subscriber_id, purpose, token_hash, 
          requested_probability70, requested_reset_announced, 
          created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        tokenParams.id,
        tokenParams.subscriber_id,
        tokenParams.purpose,
        tokenParams.token_hash,
        tokenParams.requested_probability70 === null
          ? null
          : tokenParams.requested_probability70
            ? 1
            : 0,
        tokenParams.requested_reset_announced === null
          ? null
          : tokenParams.requested_reset_announced
            ? 1
            : 0,
        tokenParams.created_at,
        tokenParams.expires_at
      );

    const auditStmt = this.db
      .prepare(
        `INSERT INTO audit_events (
          id, type, deduplication_key, subject_type, subject_id, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(deduplication_key) DO NOTHING`
      )
      .bind(
        auditParams.id,
        auditParams.type,
        auditParams.deduplication_key,
        auditParams.subject_type,
        auditParams.subject_id,
        payloadJson,
        auditParams.created_at
      );

    const stmts = [revokeStmt, tokenStmt, auditStmt];

    const versionStmt = this.db
      .prepare(
        `UPDATE subscribers SET token_version = token_version + 1, updated_at = ? WHERE id = ? AND token_version = ?`
      )
      .bind(now, subscriberId, expectedTokenVersion);
    stmts.push(versionStmt);

    if (transitionToPending) {
      const subStmt = this.db
        .prepare(
          `UPDATE subscribers SET state = 'pending_confirmation', updated_at = ? WHERE id = ?`
        )
        .bind(now, subscriberId);
      stmts.push(subStmt);
    }

    const batchRes = await this.db.batch(stmts);

    // Check if the optimistic lock failed on the subscriber update.
    // D1 batch results map 1:1 to the statements passed.
    // Our versionStmt is at index 3.
    const versionUpdateIndex = 3;
    if (batchRes[versionUpdateIndex].meta.changes === 0) {
      throw new Error('CONCURRENCY_CONFLICT');
    }
  }

  /**
   * Confirm subscription:
   * 1. Mark confirm token consumed
   * 2. Update subscriber state and preferences
   * 3. Insert initial manage_subscription token
   * 4. Insert audit
   */
  async confirmSubscription(
    confirmTokenId: string,
    subscriberId: string,
    newPreferences: { notify_70: boolean; notify_announced: boolean },
    managementTokenParams: CreateSubscriptionTokenParams,
    auditParams: CreateAuditParams,
    now: string
  ): Promise<boolean> {
    const payloadJson = auditParams.payload ? JSON.stringify(auditParams.payload) : null;
    const consumeStmt = this.db
      .prepare(
        `UPDATE subscription_tokens SET consumed_at = ? 
         WHERE id = ? AND consumed_at IS NULL`
      )
      .bind(now, confirmTokenId);

    const subStmt = this.db
      .prepare(
        `UPDATE subscribers SET state = 'active', notify_70 = ?, notify_announced = ?, updated_at = ?, confirmed_at = ? WHERE id = ?`
      )
      .bind(
        newPreferences.notify_70 ? 1 : 0,
        newPreferences.notify_announced ? 1 : 0,
        now,
        now,
        subscriberId
      );

    const mgmtTokenStmt = this.db
      .prepare(
        `INSERT INTO subscription_tokens (
          id, subscriber_id, purpose, token_hash, 
          created_at, expires_at
        ) VALUES (?, ?, 'manage_subscription', ?, ?, ?)`
      )
      .bind(
        managementTokenParams.id,
        managementTokenParams.subscriber_id,
        managementTokenParams.token_hash,
        managementTokenParams.created_at,
        managementTokenParams.expires_at
      );

    // If we want to bound to 2 tokens max during confirm? It's the first token usually.
    // If not, we don't strictly need to revoke here because confirm is just one token, unless they confirm repeatedly.
    // But let's add `tokensToRevoke` just in case.

    const auditStmt = this.db
      .prepare(
        `INSERT INTO audit_events (
          id, type, deduplication_key, subject_type, subject_id, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(deduplication_key) DO NOTHING`
      )
      .bind(
        auditParams.id,
        auditParams.type,
        auditParams.deduplication_key,
        auditParams.subject_type,
        auditParams.subject_id,
        payloadJson,
        auditParams.created_at
      );

    const res = await this.db.batch([consumeStmt, subStmt, mgmtTokenStmt, auditStmt]);
    return res[0].meta.changes > 0;
  }

  /**
   * Issue a management token and ensure active tokens <= 2.
   */
  async issueManagementToken(
    tokenParams: CreateSubscriptionTokenParams,
    tokensToRevoke: string[],
    auditParams: CreateAuditParams,
    now: string
  ) {
    const stmts: D1PreparedStatement[] = [];

    for (const tokenId of tokensToRevoke) {
      stmts.push(
        this.db
          .prepare(`UPDATE subscription_tokens SET revoked_at = ? WHERE id = ?`)
          .bind(now, tokenId)
      );
    }

    stmts.push(
      this.db
        .prepare(
          `INSERT INTO subscription_tokens (
            id, subscriber_id, purpose, token_hash, created_at, expires_at
          ) VALUES (?, ?, 'manage_subscription', ?, ?, ?)`
        )
        .bind(
          tokenParams.id,
          tokenParams.subscriber_id,
          tokenParams.token_hash,
          tokenParams.created_at,
          tokenParams.expires_at
        )
    );

    if (auditParams) {
      const payloadJson = auditParams.payload ? JSON.stringify(auditParams.payload) : null;
      stmts.push(
        this.db
          .prepare(
            `INSERT INTO audit_events (
              id, type, deduplication_key, subject_type, subject_id, payload_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(deduplication_key) DO NOTHING`
          )
          .bind(
            auditParams.id,
            auditParams.type,
            auditParams.deduplication_key,
            auditParams.subject_type,
            auditParams.subject_id,
            payloadJson,
            auditParams.created_at
          )
      );
    }

    await this.db.batch(stmts);
  }

  /**
   * Safe rotation of management tokens:
   * Revokes all active management tokens except the one currently used.
   */
  async rotateManagementTokens(
    subscriberId: string,
    currentTokenId: string,
    auditParams: CreateAuditParams,
    now: string
  ) {
    const payloadJson = auditParams.payload ? JSON.stringify(auditParams.payload) : null;
    const revokeStmt = this.db
      .prepare(
        `UPDATE subscription_tokens SET revoked_at = ? 
         WHERE subscriber_id = ? AND purpose = 'manage_subscription' 
           AND id != ? AND revoked_at IS NULL AND consumed_at IS NULL`
      )
      .bind(now, subscriberId, currentTokenId);

    const auditStmt = this.db
      .prepare(
        `INSERT INTO audit_events (
          id, type, deduplication_key, subject_type, subject_id, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(deduplication_key) DO NOTHING`
      )
      .bind(
        auditParams.id,
        auditParams.type,
        auditParams.deduplication_key,
        auditParams.subject_type,
        auditParams.subject_id,
        payloadJson,
        auditParams.created_at
      );

    await this.db.batch([revokeStmt, auditStmt]);
  }

  /**
   * Update preferences (Management)
   */
  async updatePreferencesAtomically(
    subscriberId: string,
    notify70: boolean,
    notifyAnnounced: boolean,
    auditParams: CreateAuditParams,
    now: string
  ) {
    const payloadJson = auditParams.payload ? JSON.stringify(auditParams.payload) : null;
    const subStmt = this.db
      .prepare(
        `UPDATE subscribers SET notify_70 = ?, notify_announced = ?, updated_at = ? WHERE id = ?`
      )
      .bind(notify70 ? 1 : 0, notifyAnnounced ? 1 : 0, now, subscriberId);

    const auditStmt = this.db
      .prepare(
        `INSERT INTO audit_events (
          id, type, deduplication_key, subject_type, subject_id, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(deduplication_key) DO NOTHING`
      )
      .bind(
        auditParams.id,
        auditParams.type,
        auditParams.deduplication_key,
        auditParams.subject_type,
        auditParams.subject_id,
        payloadJson,
        auditParams.created_at
      );

    await this.db.batch([subStmt, auditStmt]);
  }

  /**
   * Unsubscribe:
   * 1. Mark unsubscribed
   * 2. Revoke all active mgmt tokens
   * 3. Insert audit
   */
  async unsubscribeAtomically(subscriberId: string, auditParams: CreateAuditParams, now: string) {
    const payloadJson = auditParams.payload ? JSON.stringify(auditParams.payload) : null;
    const subStmt = this.db
      .prepare(
        `UPDATE subscribers SET state = 'unsubscribed', unsubscribed_at = ?, updated_at = ? WHERE id = ?`
      )
      .bind(now, now, subscriberId);

    const revokeStmt = this.db
      .prepare(
        `UPDATE subscription_tokens SET revoked_at = ? 
         WHERE subscriber_id = ? AND purpose = 'manage_subscription' 
           AND revoked_at IS NULL AND consumed_at IS NULL`
      )
      .bind(now, subscriberId);

    const auditStmt = this.db
      .prepare(
        `INSERT INTO audit_events (
          id, type, deduplication_key, subject_type, subject_id, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(deduplication_key) DO NOTHING`
      )
      .bind(
        auditParams.id,
        auditParams.type,
        auditParams.deduplication_key,
        auditParams.subject_type,
        auditParams.subject_id,
        payloadJson,
        auditParams.created_at
      );

    await this.db.batch([subStmt, revokeStmt, auditStmt]);
  }
}
