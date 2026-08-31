import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeliveryPreparationService } from '../../src/services/delivery-preparation-service';
import { setupTestDb } from '../db/test-utils';
import { ResetEventRepository } from '../../src/db/repositories/ResetEventRepository';
import { SubscriberRepository } from '../../src/db/repositories/SubscriberRepository';
import { NotificationDeliveryRepository } from '../../src/db/repositories/NotificationDeliveryRepository';
import { AuditEventRepository } from '../../src/db/repositories/AuditEventRepository';

describe('Delivery Preparation Service', () => {
  let db: D1Database;
  let prepService: DeliveryPreparationService;
  let subRepo: SubscriberRepository;
  let deliveryRepo: NotificationDeliveryRepository;
  const now = new Date().toISOString();

  beforeEach(async () => {
    db = await setupTestDb();
    const eventRepo = new ResetEventRepository(db);
    subRepo = new SubscriberRepository(db);
    deliveryRepo = new NotificationDeliveryRepository(db);
    const auditRepo = new AuditEventRepository(db);
    prepService = new DeliveryPreparationService(eventRepo, subRepo, deliveryRepo, auditRepo);

    // Setup base data
    await db
      .prepare(
        "INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('cyc1', 'active', ?, ?)"
      )
      .bind(now, now)
      .run();
    await db
      .prepare(
        "INSERT INTO source_snapshots (id, reset_cycle_id, probability, lifecycle, source_health, checked_at, payload_hash, created_at) VALUES ('snap1', 'cyc1', 73, 'none', 'healthy', ?, 'hash', ?)"
      )
      .bind(now, now)
      .run();

    // Create event
    await db
      .prepare(
        "INSERT INTO reset_events (id, reset_cycle_id, type, threshold, current_probability, source_snapshot_id, created_at) VALUES ('evt1', 'cyc1', 'PROBABILITY_REACHED_70', 70, 73, 'snap1', ?)"
      )
      .bind(now)
      .run();
  });

  const createSub = async (id: string, prob70: boolean, state: string = 'active') => {
    await subRepo
      .getCreateStatement({
        id,
        email: `${id}@test.com`,
        normalized_email: `${id}@test.com`,
        state: state as 'active',
        notify_70: prob70,
        notify_announced: false,
        management_token_hash: 'hash',
        created_at: now,
      })
      .run();
  };

  it('DEL-PREP-1: Eligible subscribers receive pending delivery rows', async () => {
    await createSub('sub1', true);
    const res = await prepService.prepareDeliveries('evt1', now);
    expect(res.outcome).toBe('prepared');
    expect(res.created).toBe(1);

    const pending = await deliveryRepo.listDuePending(now, 10);
    expect(pending.length).toBe(1);
    expect(pending[0].subscriber_id).toBe('sub1');
  });

  it('DEL-PREP-2: Ineligible subscribers receive no delivery', async () => {
    await createSub('sub1', false);
    const res = await prepService.prepareDeliveries('evt1', now);
    expect(res.outcome).toBe('prepared');
    expect(res.created).toBe(0);
    expect(res.ineligible).toBe(1);

    const pending = await deliveryRepo.listDuePending(now, 10);
    expect(pending.length).toBe(0);
  });

  it('DEL-PREP-3: Repeated preparation creates no duplicate delivery', async () => {
    await createSub('sub1', true);
    await prepService.prepareDeliveries('evt1', now);
    const res2 = await prepService.prepareDeliveries('evt1', now);

    expect(res2.created || 0).toBe(0);
    expect(res2.alreadyExisting).toBe(1);

    const pending = await deliveryRepo.listDuePending(now, 10);
    expect(pending.length).toBe(1);
  });

  it('DEL-PREP-4: Concurrent preparation creates exactly one delivery per subscriber/event/channel.', async () => {
    await createSub('sub1', true);
    // Since we are not strictly multi-threaded, we can just prove the unique constraint works
    const res1Promise = prepService.prepareDeliveries('evt1', now);
    const res2Promise = prepService.prepareDeliveries('evt1', now);

    const [res1, res2] = await Promise.all([res1Promise, res2Promise]);
    expect((res1.created || 0) + (res2.created || 0)).toBe(1);

    const { results } = await db.prepare('SELECT * FROM notification_deliveries').all();
    expect(results.length).toBe(1);
  });

  it('DEL-PREP-5: Unsupported event creates no delivery', async () => {
    const eventRepo = prepService['resetEventRepo']; // or use vi.spyOn
    vi.spyOn(eventRepo, 'findById').mockResolvedValueOnce({
      id: 'evt2',
      type: 'UNSUPPORTED_TYPE',
      reset_cycle_id: 'cyc1',
      source_snapshot_id: 'snap1',
      created_at: now,
    } as Record<string, unknown> as unknown as import('../../src/db/schema').ResetEventRow);

    await createSub('sub1', true);
    const res = await prepService.prepareDeliveries('evt2', now);
    expect(res.outcome).toBe('unsupported_event');

    const { results } = await db.prepare('SELECT * FROM notification_deliveries').all();
    expect(results.length).toBe(0);
  });

  it('DEL-PREP-6: Preparation does not call email provider', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await createSub('sub1', true);
    await prepService.prepareDeliveries('evt1', now);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('DEL-PREP-7: Preparation preserves event and subscriber references', async () => {
    await createSub('sub1', true);
    await prepService.prepareDeliveries('evt1', now);
    const { results } = await db.prepare('SELECT * FROM notification_deliveries').all();
    expect(results[0].event_id).toBe('evt1');
    expect(results[0].subscriber_id).toBe('sub1');
  });
});
