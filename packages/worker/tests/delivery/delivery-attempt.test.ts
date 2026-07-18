import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '../db/test-utils';
import { NotificationDeliveryRepository } from '../../src/db/repositories/NotificationDeliveryRepository';
import { DeliveryProcessingService } from '../../src/services/delivery-processing-service';
import { DeliveryRetryPolicy } from '../../src/delivery/delivery-retry-policy';
import { MockEmailProvider } from '../../src/email/providers/mock-email-provider';
import { AuditEventRepository } from '../../src/db/repositories/AuditEventRepository';

describe('Delivery Attempt Semantics', () => {
  let db: D1Database;
  let deliveryRepo: NotificationDeliveryRepository;
  let auditRepo: AuditEventRepository;
  const nowStr = '2026-07-18T12:00:00.000Z';

  beforeEach(async () => {
    db = await setupTestDb();
    deliveryRepo = new NotificationDeliveryRepository(db);
    auditRepo = new AuditEventRepository(db);

    await db
      .prepare(
        "INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('cyc1', 'active', ?, ?)"
      )
      .bind(nowStr, nowStr)
      .run();
    await db
      .prepare(
        "INSERT INTO source_snapshots (id, reset_cycle_id, probability, lifecycle, source_health, checked_at, payload_hash, created_at) VALUES ('snap1', 'cyc1', 73, 'none', 'healthy', ?, 'hash', ?)"
      )
      .bind(nowStr, nowStr)
      .run();
    await db
      .prepare(
        "INSERT INTO reset_events (id, reset_cycle_id, type, threshold, current_probability, source_snapshot_id, created_at) VALUES ('evt1', 'cyc1', 'PROBABILITY_REACHED_70', 70, 73, 'snap1', ?)"
      )
      .bind(nowStr)
      .run();
    await db
      .prepare(
        "INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, token_version, created_at, updated_at) VALUES ('sub1', 'a@test.com', 'a@test.com', 'active', 1, 0, 'hash', 1, ?, ?)"
      )
      .bind(nowStr, nowStr)
      .run();
  });

  const insertDelivery = async (id: string, state: string, attemptCount: number) => {
    await db
      .prepare(
        "INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, attempt_count, created_at, updated_at) VALUES (?, 'evt1', 'sub1', 'email', ?, ?, ?, ?)"
      )
      .bind(id, state, attemptCount, nowStr, nowStr)
      .run();
  };

  it('DEL-ATTEMPT-1: Successful claim increments attempt_count exactly once.', async () => {
    await insertDelivery('del1', 'pending', 0);
    await deliveryRepo.claimForProcessing('del1', 'tok1', nowStr, nowStr, nowStr);

    const row = await deliveryRepo.findById('del1');
    expect(row!.attempt_count).toBe(1);
  });

  it('DEL-ATTEMPT-2: Retryable provider failure returns processing -> pending without incrementing attempt_count.', async () => {
    await insertDelivery('del1', 'pending', 1);
    // Force to processing to simulate already claimed
    await db
      .prepare(
        "UPDATE notification_deliveries SET state = 'processing', processing_token = 'tok1' WHERE id = 'del1'"
      )
      .run();

    await deliveryRepo.markRetryableFailure('del1', 'tok1', 'ERR', 'MSG', nowStr, nowStr);

    const row = await deliveryRepo.findById('del1');
    expect(row!.state).toBe('pending');
    expect(row!.attempt_count).toBe(1);
  });

  it('DEL-ATTEMPT-3: Stale recovery leaves attempt_count unchanged.', async () => {
    await insertDelivery('del1', 'pending', 2);
    await db
      .prepare(
        "UPDATE notification_deliveries SET state = 'processing', processing_token = 'tok1' WHERE id = 'del1'"
      )
      .run();

    await deliveryRepo.recoverStaleClaim('del1', 'tok1', nowStr, nowStr);

    const row = await deliveryRepo.findById('del1');
    expect(row!.state).toBe('pending');
    expect(row!.attempt_count).toBe(2);
  });

  it('DEL-ATTEMPT-4: A later successful claim increments the previous value by exactly one.', async () => {
    await insertDelivery('del1', 'pending', 3);
    await deliveryRepo.claimForProcessing('del1', 'tok1', nowStr, nowStr, nowStr);

    const row = await deliveryRepo.findById('del1');
    expect(row!.attempt_count).toBe(4);
  });

  it('DEL-ATTEMPT-5: Attempt 5 retryable failure becomes failed_permanent without scheduling attempt 6.', async () => {
    await insertDelivery('del1', 'pending', 4);
    // Calculate next attempt to prove it will be null after increment
    const nextAttempt = DeliveryRetryPolicy.calculateNextAttemptAt(5, new Date(), null);
    expect(nextAttempt).toBeNull(); // Max attempts exceeded

    // Thus it should be marked permanent by the service. We test the service directly.
    const mockProvider = new MockEmailProvider();
    mockProvider.nextResult = {
      outcome: 'retryable_failure',
      code: 'ERR',
      retryAfterSeconds: null,
    };

    const service = new DeliveryProcessingService(deliveryRepo, auditRepo, mockProvider, {
      now: () => new Date(nowStr),
    });
    const res = await service.processNextDueDelivery();

    expect(res.outcome).toBe('failed_permanent_max_attempts');
    const rowAfter = await deliveryRepo.findById('del1');
    expect(rowAfter!.state).toBe('failed_permanent');
    expect(rowAfter!.attempt_count).toBe(5);
  });
});
