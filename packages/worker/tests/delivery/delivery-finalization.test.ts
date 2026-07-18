import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '../db/test-utils';
import { NotificationDeliveryRepository } from '../../src/db/repositories/NotificationDeliveryRepository';

describe('Delivery Finalization', () => {
  let db: D1Database;
  let deliveryRepo: NotificationDeliveryRepository;
  const nowStr = '2026-07-18T12:00:00.000Z';

  beforeEach(async () => {
    db = await setupTestDb();
    deliveryRepo = new NotificationDeliveryRepository(db);

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

  const insertProcessingDelivery = async (id: string, token: string) => {
    await db
      .prepare(
        "INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, attempt_count, processing_token, processing_started_at, created_at, updated_at) VALUES (?, 'evt1', 'sub1', 'email', 'processing', 1, ?, ?, ?, ?)"
      )
      .bind(id, token, nowStr, nowStr, nowStr)
      .run();
  };

  it('DEL-FINAL-1: Matching claim can mark sent.', async () => {
    await insertProcessingDelivery('del1', 'tok1');
    const fin = await deliveryRepo.markSentToProvider('del1', 'tok1', 'msg123', nowStr);
    expect(fin.outcome).toBe('success');
  });

  it('DEL-FINAL-2: Stale token cannot mark sent.', async () => {
    await insertProcessingDelivery('del1', 'tok1');
    const fin = await deliveryRepo.markSentToProvider('del1', 'tok2', 'msg123', nowStr);
    expect(fin.outcome).toBe('stale_claim');
  });

  it('DEL-FINAL-3: Stale token cannot schedule retry.', async () => {
    await insertProcessingDelivery('del1', 'tok1');
    const fin = await deliveryRepo.markRetryableFailure(
      'del1',
      'tok2',
      'err',
      'msg',
      nowStr,
      nowStr
    );
    expect(fin.outcome).toBe('stale_claim');
  });

  it('DEL-FINAL-4: Stale token cannot mark failed_permanent.', async () => {
    await insertProcessingDelivery('del1', 'tok1');
    const fin = await deliveryRepo.markPermanentFailure('del1', 'tok2', 'err', 'msg', nowStr);
    expect(fin.outcome).toBe('stale_claim');
  });

  it('DEL-FINAL-5: Stale token cannot cancel.', async () => {
    await insertProcessingDelivery('del1', 'tok1');
    const fin = await deliveryRepo.markCancelled('del1', 'tok2', 'code', 'reason', nowStr);
    expect(fin.outcome).toBe('stale_claim');
  });

  it('DEL-FINAL-6: Successful finalization clears processing fields.', async () => {
    await insertProcessingDelivery('del1', 'tok1');
    await deliveryRepo.markRetryableFailure('del1', 'tok1', 'err', 'msg', nowStr, nowStr);

    const row = await deliveryRepo.findById('del1');
    expect(row!.state).toBe('pending');
    expect(row!.processing_token).toBeNull();
    expect(row!.processing_started_at).toBeNull();
  });
});
