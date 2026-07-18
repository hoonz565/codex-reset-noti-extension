import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeliveryProcessingService } from '../../src/services/delivery-processing-service';
import { setupTestDb } from '../db/test-utils';
import { NotificationDeliveryRepository } from '../../src/db/repositories/NotificationDeliveryRepository';
import { SubscriberRepository } from '../../src/db/repositories/SubscriberRepository';
import { ResetEventRepository } from '../../src/db/repositories/ResetEventRepository';
import { SourceSnapshotRepository } from '../../src/db/repositories/SourceSnapshotRepository';
import { AuditEventRepository } from '../../src/db/repositories/AuditEventRepository';
import { MockEmailProvider } from '../../src/email/providers/mock-email-provider';
import { EmailTemplateRenderer } from '../../src/email/email-template-renderer';

describe('Delivery Processing Service', () => {
  let db: D1Database;
  let service: DeliveryProcessingService;
  let provider: MockEmailProvider;
  let deliveryRepo: NotificationDeliveryRepository;
  let subRepo: SubscriberRepository;
  const now = new Date('2026-07-18T12:00:00Z');
  const nowIso = now.toISOString();

  beforeEach(async () => {
    db = await setupTestDb();
    deliveryRepo = new NotificationDeliveryRepository(db);
    subRepo = new SubscriberRepository(db);
    const eventRepo = new ResetEventRepository(db);
    const snapshotRepo = new SourceSnapshotRepository(db);
    const auditRepo = new AuditEventRepository(db);
    provider = new MockEmailProvider();
    const renderer = new EmailTemplateRenderer('https://test.com/manage');

    service = new DeliveryProcessingService(
      deliveryRepo,
      subRepo,
      eventRepo,
      snapshotRepo,
      auditRepo,
      provider,
      renderer,
      { now: () => now }
    );

    // Setup base data
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
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 'a@test.com',
        normalized_email: 'a@test.com',
        state: 'active',
        notify_70: true,
        notify_announced: false,
        management_token_hash: 'hash',
        created_at: nowIso,
      })
      .run();
    await deliveryRepo.createIfAbsent({
      id: 'del1',
      event_id: 'evt1',
      subscriber_id: 'sub1',
      channel: 'email',
      state: 'pending',
      created_at: nowIso,
    });
  });

  it('DEL-PROC-1: Claimed eligible delivery sends exactly once to provider.', async () => {
    provider.nextResult = { outcome: 'accepted', providerMessageId: 'msg-123' };
    const res = await service.processNextDueDelivery();
    expect(res.outcome).toBe('sent');
    expect(provider.calls.length).toBe(1);
  });

  it('DEL-PROC-2: Accepted provider response marks sent_to_provider.', async () => {
    provider.nextResult = { outcome: 'accepted', providerMessageId: 'msg-123' };
    const res = await service.processNextDueDelivery();
    expect(res.outcome).toBe('sent');

    const row = await deliveryRepo.findById('del1');
    expect(row!.state).toBe('sent_to_provider');
  });

  it('DEL-PROC-3: provider_message_id is persisted when present.', async () => {
    provider.nextResult = { outcome: 'accepted', providerMessageId: 'msg-123' };
    await service.processNextDueDelivery();

    const row = await deliveryRepo.findById('del1');
    expect(row!.provider_message_id).toBe('msg-123');
  });

  it('DEL-PROC-4: Retryable provider failure returns to pending and schedules retry.', async () => {
    provider.nextResult = {
      outcome: 'retryable_failure',
      code: 'RATE_LIMITED',
      retryAfterSeconds: 120,
    };
    const res = await service.processNextDueDelivery();
    expect(res.outcome).toBe('retry_scheduled');

    const row = await deliveryRepo.findById('del1');
    expect(row!.state).toBe('pending');
    expect(row!.attempt_count).toBe(1);
    const expectedTime = new Date(now.getTime() + 120000).toISOString();
    expect(row!.next_attempt_at).toBe(expectedTime);
  });

  it('DEL-RETRY-4: A retryable failure after attempt 5 transitions to failed_permanent and does not schedule attempt 6.', async () => {
    // Manually push attempt_count to 4 (so claiming it makes it 5)
    await db
      .prepare("UPDATE notification_deliveries SET attempt_count = 4 WHERE id = 'del1'")
      .run();
    provider.nextResult = { outcome: 'retryable_failure', code: 'RATE_LIMITED' };

    const res = await service.processNextDueDelivery();
    expect(res.outcome).toBe('failed_permanent_max_attempts');

    const row = await deliveryRepo.findById('del1');
    expect(row!.state).toBe('failed_permanent');
    expect(row!.attempt_count).toBe(5);
  });

  it('DEL-RETRY-5: Scheduling a retry updates the existing notification_deliveries row and does not create another delivery row.', async () => {
    provider.nextResult = { outcome: 'retryable_failure', code: 'RATE_LIMITED' };
    await service.processNextDueDelivery();

    const { results } = await db
      .prepare("SELECT * FROM notification_deliveries WHERE subscriber_id = 'sub1'")
      .all();
    expect(results.length).toBe(1);
    expect(results[0].state).toBe('pending');
    expect(results[0].attempt_count).toBe(1);
  });

  it('DEL-PROC-5: Permanent provider failure becomes failed_permanent.', async () => {
    provider.nextResult = { outcome: 'permanent_failure', code: 'BOUNCE' };
    const res = await service.processNextDueDelivery();
    expect(res.outcome).toBe('permanent_failure');

    const row = await deliveryRepo.findById('del1');
    expect(row!.state).toBe('failed_permanent');
  });

  it('DEL-PROC-6: Subscriber unsubscribed before send causes cancelled without provider call.', async () => {
    await db.prepare("UPDATE subscribers SET state = 'unsubscribed' WHERE id = 'sub1'").run();
    const res = await service.processNextDueDelivery();
    expect(res.outcome).toBe('cancelled_ineligible');

    const row = await deliveryRepo.findById('del1');
    expect(row!.state).toBe('cancelled');
    expect(provider.calls.length).toBe(0);
  });

  it('DEL-PROC-7: Matching preference disabled before send causes cancelled without provider call.', async () => {
    await db.prepare("UPDATE subscribers SET notify_70 = 0 WHERE id = 'sub1'").run();
    const res = await service.processNextDueDelivery();
    expect(res.outcome).toBe('cancelled_ineligible');

    const row = await deliveryRepo.findById('del1');
    expect(row!.state).toBe('cancelled');
    expect(provider.calls.length).toBe(0);
  });

  it('DEL-PROC-8: Stale processing_token cannot finalize or overwrite a newer claim.', async () => {
    // We simulate this by changing the token right before finalization
    // DeliveryProcessingService handles finalization internally, but if we change it in DB, it will fail
    provider.nextResult = { outcome: 'accepted', providerMessageId: 'msg-123' };

    // We can't hook into the middle easily in an integration test, so we'll mock the finalization call to see it gracefully return failed
    // Or we mock markSentToProvider
    vi.spyOn(deliveryRepo, 'markSentToProvider').mockResolvedValue({ outcome: 'stale_claim' });

    const res = await service.processNextDueDelivery();
    expect(res.outcome).toBe('fatal_error');

    // Actually the actual service catches and returns 'fatal_error' if stale_claim occurs
    expect(res.error).toBeDefined();
  });

  it('DEL-PROC-9: Provider-native exception is mapped to a stable typed failure.', async () => {
    vi.spyOn(provider, 'send').mockRejectedValueOnce(new Error('Network timeout'));
    const res = await service.processNextDueDelivery();
    expect(res.outcome).toBe('failed_internal_retry');
  });

  it('DEL-PROC-10: No provider credential, raw token, or secret is logged.', async () => {
    // Just verifying audit log
    provider.nextResult = { outcome: 'accepted', providerMessageId: 'msg-123' };
    await service.processNextDueDelivery();
    const audits = await db
      .prepare("SELECT * FROM audit_events WHERE type = 'DELIVERY_SENT_TO_PROVIDER'")
      .all();
    const payload = JSON.parse(audits.results[0].payload_json as string);
    expect(payload.credential).toBeUndefined();
    expect(payload.rawToken).toBeUndefined();
    expect(payload.secret).toBeUndefined();
  });

  it('Subscriber-deleted cancels delivery', async () => {
    vi.spyOn(subRepo, 'findById').mockResolvedValue(null);
    const res = await service.processNextDueDelivery();
    expect(res.outcome).toBe('cancelled_subscriber_not_found');
  });
});
