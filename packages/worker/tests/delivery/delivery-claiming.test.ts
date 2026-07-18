import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '../db/test-utils';
import { NotificationDeliveryRepository } from '../../src/db/repositories/NotificationDeliveryRepository';

describe('Delivery Claiming', () => {
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

  const insertDelivery = async (
    id: string,
    state: string,
    nextAttemptAt: string | null = null,
    attemptCount: number = 0
  ) => {
    await db
      .prepare(
        "INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, attempt_count, next_attempt_at, created_at, updated_at) VALUES (?, 'evt1', 'sub1', 'email', ?, ?, ?, ?, ?)"
      )
      .bind(id, state, attemptCount, nextAttemptAt, nowStr, nowStr)
      .run();
  };

  it('DEL-CLAIM-1: Due pending delivery can be claimed.', async () => {
    await insertDelivery('del1', 'pending', '2026-07-18T11:55:00.000Z', 1);
    const claim = await deliveryRepo.claimForProcessing('del1', 'tok1', nowStr, nowStr, nowStr);
    expect(claim.outcome).toBe('claimed');

    const row = await deliveryRepo.findById('del1');
    expect(row!.state).toBe('processing');
  });

  it('DEL-CLAIM-2: Future next_attempt_at cannot be claimed.', async () => {
    await insertDelivery('del1', 'pending', '2026-07-18T12:05:00.000Z', 1);
    const claim = await deliveryRepo.claimForProcessing('del1', 'tok1', nowStr, nowStr, nowStr);
    expect(claim.outcome).toBe('not_due');
  });

  it('DEL-CLAIM-3: Two concurrent claims produce exactly one winner.', async () => {
    await insertDelivery('del1', 'pending');
    // Using Promise.all to simulate concurrent claims on same row
    const [c1, c2] = await Promise.all([
      deliveryRepo.claimForProcessing('del1', 'tok1', nowStr, nowStr, nowStr),
      deliveryRepo.claimForProcessing('del1', 'tok2', nowStr, nowStr, nowStr),
    ]);
    const outcomes = [c1.outcome, c2.outcome];
    expect(outcomes).toContain('claimed');
    // The loser will either be already_claimed (if it happens sequentially in D1) or not_due (if state changed)
    const claimedCount = outcomes.filter((o) => o === 'claimed').length;
    expect(claimedCount).toBe(1);
  });

  it('DEL-CLAIM-4: Successful claim increments attempt_count exactly once.', async () => {
    await insertDelivery('del1', 'pending', null, 0);
    await deliveryRepo.claimForProcessing('del1', 'tok1', nowStr, nowStr, nowStr);

    const row = await deliveryRepo.findById('del1');
    expect(row!.attempt_count).toBe(1);
  });

  it('DEL-CLAIM-5: Successful claim stores processing_token.', async () => {
    await insertDelivery('del1', 'pending');
    await deliveryRepo.claimForProcessing('del1', 'tok1', nowStr, nowStr, nowStr);

    const row = await deliveryRepo.findById('del1');
    expect(row!.processing_token).toBe('tok1');
  });

  it('DEL-CLAIM-6: Already-processing delivery is not claimed again.', async () => {
    await insertDelivery('del1', 'processing');
    const claim = await deliveryRepo.claimForProcessing('del1', 'tok1', nowStr, nowStr, nowStr);
    expect(claim.outcome).toBe('already_claimed');
  });

  it('DEL-CLAIM-7: Terminal delivery cannot be claimed.', async () => {
    await insertDelivery('del1', 'sent_to_provider');
    const claim = await deliveryRepo.claimForProcessing('del1', 'tok1', nowStr, nowStr, nowStr);
    expect(claim.outcome).toBe('terminal');
  });

  it('DEL-CLAIM-8: Unrelated database error returns a typed failed result.', async () => {
    await insertDelivery('del1', 'pending');
    vi.spyOn(deliveryRepo['db'], 'prepare').mockImplementationOnce(() => {
      throw new Error('DB Error');
    });
    const claim = await deliveryRepo.claimForProcessing('del1', 'tok1', nowStr, nowStr, nowStr);
    expect(claim.outcome).toBe('failed');
  });

  it('DEL-STATE-1: Retryable failure returns the delivery to pending.', async () => {
    // tested directly via markRetryableFailure
    await insertDelivery('del1', 'processing');
    await deliveryRepo['db']
      .prepare("UPDATE notification_deliveries SET processing_token = 'tok1'")
      .run();
    await deliveryRepo.markRetryableFailure(
      'del1',
      'tok1',
      'ERR',
      'MSG',
      '2026-07-18T12:05:00.000Z',
      nowStr
    );
    const row = await deliveryRepo.findById('del1');
    expect(row!.state).toBe('pending');
  });

  it('DEL-STATE-2: A pending delivery with future next_attempt_at is not claimable.', async () => {
    await insertDelivery('del1', 'pending', '2026-07-18T12:05:00.000Z', 1);
    const claim = await deliveryRepo.claimForProcessing('del1', 'tok1', nowStr, nowStr, nowStr);
    expect(claim.outcome).toBe('not_due');
  });

  it('DEL-STATE-3: A pending delivery with due next_attempt_at is claimable.', async () => {
    await insertDelivery('del1', 'pending', '2026-07-18T11:55:00.000Z', 1);
    const claim = await deliveryRepo.claimForProcessing('del1', 'tok1', nowStr, nowStr, nowStr);
    expect(claim.outcome).toBe('claimed');
  });
});
