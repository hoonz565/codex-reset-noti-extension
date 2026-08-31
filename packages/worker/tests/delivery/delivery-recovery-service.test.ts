import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeliveryRecoveryService } from '../../src/services/delivery-recovery-service';
import { setupTestDb } from '../db/test-utils';
import { NotificationDeliveryRepository } from '../../src/db/repositories/NotificationDeliveryRepository';
import { AuditEventRepository } from '../../src/db/repositories/AuditEventRepository';

describe('Delivery Recovery Service', () => {
  let db: D1Database;
  let service: DeliveryRecoveryService;
  let deliveryRepo: NotificationDeliveryRepository;
  const now = new Date('2026-07-18T12:00:00Z');
  const nowIso = now.toISOString();

  beforeEach(async () => {
    db = await setupTestDb();
    deliveryRepo = new NotificationDeliveryRepository(db);
    const auditRepo = new AuditEventRepository(db);
    service = new DeliveryRecoveryService(deliveryRepo, auditRepo, { now: () => now });

    await db
      .prepare(
        "INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('cyc1', 'active', ?, ?)"
      )
      .bind(nowIso, nowIso)
      .run();
    await db
      .prepare(
        "INSERT INTO source_snapshots (id, reset_cycle_id, probability, lifecycle, source_health, checked_at, payload_hash, created_at) VALUES ('snap1', 'cyc1', 73, 'none', 'healthy', ?, 'hash', ?)"
      )
      .bind(nowIso, nowIso)
      .run();
    await db
      .prepare(
        "INSERT INTO reset_events (id, reset_cycle_id, type, threshold, current_probability, source_snapshot_id, created_at) VALUES ('evt1', 'cyc1', 'PROBABILITY_REACHED_70', 70, 73, 'snap1', ?)"
      )
      .bind(nowIso)
      .run();
    await db
      .prepare(
        "INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, token_version, created_at, updated_at) VALUES ('sub1', 'a@test.com', 'a@test.com', 'active', 1, 0, 'hash', 1, ?, ?)"
      )
      .bind(nowIso, nowIso)
      .run();
  });

  const insertProcessingDelivery = async (id: string, startedAt: string) => {
    await db
      .prepare(
        "INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, attempt_count, processing_token, processing_started_at, created_at, updated_at) VALUES (?, 'evt1', 'sub1', 'email', 'processing', 1, 'tok1', ?, ?, ?)"
      )
      .bind(id, startedAt, nowIso, nowIso)
      .run();
  };

  it('DEL-REC-1: Expired processing lease returns delivery to pending.', async () => {
    const staleTime = new Date(now.getTime() - 6 * 60000).toISOString(); // 6 mins ago
    await insertProcessingDelivery('del1', staleTime);

    const res = await service.recoverStaleClaims(5 * 60000);
    expect(res.recoveredCount).toBe(1);

    const row = await deliveryRepo.findById('del1');
    expect(row!.state).toBe('pending');
  });

  it('DEL-REC-2: Non-expired processing lease remains unchanged.', async () => {
    const freshTime = new Date(now.getTime() - 3 * 60000).toISOString(); // 3 mins ago
    await insertProcessingDelivery('del1', freshTime);

    const res = await service.recoverStaleClaims(5 * 60000);
    expect(res.recoveredCount).toBe(0);

    const row = await deliveryRepo.findById('del1');
    expect(row!.state).toBe('processing');
  });

  it('DEL-REC-3: Recovery clears processing_token and processing_started_at.', async () => {
    const staleTime = new Date(now.getTime() - 6 * 60000).toISOString();
    await insertProcessingDelivery('del1', staleTime);
    await service.recoverStaleClaims(5 * 60000);

    const row = await deliveryRepo.findById('del1');
    expect(row!.processing_token).toBeNull();
    expect(row!.processing_started_at).toBeNull();
  });

  it('DEL-REC-4: Repeated recovery is idempotent.', async () => {
    const staleTime = new Date(now.getTime() - 6 * 60000).toISOString();
    await insertProcessingDelivery('del1', staleTime);
    await service.recoverStaleClaims(5 * 60000);
    const res2 = await service.recoverStaleClaims(5 * 60000);

    expect(res2.recoveredCount).toBe(0);
  });

  it('DEL-REC-5: Recovered delivery can later be claimed.', async () => {
    const staleTime = new Date(now.getTime() - 6 * 60000).toISOString();
    await insertProcessingDelivery('del1', staleTime);
    await service.recoverStaleClaims(5 * 60000);

    const claim = await deliveryRepo.claimForProcessing('del1', 'tok2', nowIso, nowIso, nowIso);
    expect(claim.outcome).toBe('claimed');
  });

  it('DEL-REC-6: Recovery never invokes the email provider.', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const staleTime = new Date(now.getTime() - 6 * 60000).toISOString();
    await insertProcessingDelivery('del1', staleTime);
    await service.recoverStaleClaims(5 * 60000);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('recovery does not increment attempt_count', async () => {
    const staleTime = new Date(now.getTime() - 6 * 60000).toISOString();
    await insertProcessingDelivery('del1', staleTime);
    await service.recoverStaleClaims(5 * 60000);

    const row = await deliveryRepo.findById('del1');
    expect(row!.attempt_count).toBe(1); // the insert started with 1
  });

  it('the next successful claim increments it once', async () => {
    const staleTime = new Date(now.getTime() - 6 * 60000).toISOString();
    await insertProcessingDelivery('del1', staleTime);
    await service.recoverStaleClaims(5 * 60000);

    await deliveryRepo.claimForProcessing('del1', 'tok2', nowIso, nowIso, nowIso);
    const row = await deliveryRepo.findById('del1');
    expect(row!.attempt_count).toBe(2);
  });
});
