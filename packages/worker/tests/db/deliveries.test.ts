import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestDb } from './test-utils';
import {
  NotificationDeliveryRepository,
  ResetEventRepository,
  SubscriberRepository,
  ResetCycleRepository,
  SourceSnapshotRepository,
} from '../../src/db';

describe('Notification Delivery Repository', () => {
  let db: D1Database;
  let repo: NotificationDeliveryRepository;

  beforeAll(async () => {
    db = await setupTestDb();
    repo = new NotificationDeliveryRepository(db);

    const subRepo = new SubscriberRepository(db);
    const cycleRepo = new ResetCycleRepository(db);
    const snapRepo = new SourceSnapshotRepository(db);
    const evtRepo = new ResetEventRepository(db);

    const ts = new Date().toISOString();

    await subRepo
      .getCreateStatement({
        id: 'sub_del',
        email: 'del@ex.com',
        normalized_email: 'del@ex.com',
        state: 'active',
        notify_70: true,
        notify_announced: true,
        management_token_hash: 'hash',
        created_at: ts,
      })
      .run();

    await cycleRepo.create({
      id: 'cycle:del',
      anchor_reset_at: null,
      state: 'active',
      created_at: ts,
    });

    await snapRepo.create({
      id: 'snap:del',
      reset_cycle_id: 'cycle:del',
      probability: 80,
      lifecycle: 'none',
      source_health: 'healthy',
      source_updated_at: ts,
      checked_at: ts,
      payload_hash: 'hash',
      meaningful_change: true,
      created_at: ts,
    });

    await evtRepo.createIfAbsent({
      id: 'evt_del',
      reset_cycle_id: 'cycle:del',
      type: 'PROBABILITY_REACHED_70',
      threshold: 70,
      previous_probability: 60,
      current_probability: 80,
      source_signal_id: null,
      source_snapshot_id: 'snap:del',
      created_at: ts,
    });
  });

  test('DB-DEL-1: Create delivery', async () => {
    const ts = new Date().toISOString();
    const { result } = await repo.createIfAbsent({
      id: 'del_1',
      event_id: 'evt_del',
      subscriber_id: 'sub_del',
      channel: 'email',
      state: 'pending',
      created_at: ts,
    });

    expect(result).toBe('inserted');
  });

  test('Idempotency: Duplicate event/subscriber/channel returns already_exists', async () => {
    const ts = new Date().toISOString();
    const { result } = await repo.createIfAbsent({
      id: 'del_2',
      event_id: 'evt_del',
      subscriber_id: 'sub_del',
      channel: 'email',
      state: 'pending',
      created_at: ts,
    });

    expect(result).toBe('already_exists');
  });

  test('REPO-CONFLICT-4: A NOT NULL violation must surface as a database/repository error', async () => {
    const ts = new Date().toISOString();
    const { result } = await repo.createIfAbsent({
      id: 'del_4',
      event_id: null as unknown as string, // NOT NULL violation
      subscriber_id: 'sub_del',
      channel: 'email',
      state: 'pending',
      created_at: ts,
    });

    expect(result).toBe('error');
  });

  test('REPO-CONFLICT-3: A foreign-key violation must surface as a database/repository error', async () => {
    const ts = new Date().toISOString();
    const { result } = await repo.createIfAbsent({
      id: 'del_fk',
      event_id: 'nonexistent_event_id', // FK violation
      subscriber_id: 'sub_del',
      channel: 'email',
      state: 'pending',
      created_at: ts,
    });

    expect(result).toBe('error');
  });

  test('DB-DEL-3: Invalid state rejected', async () => {
    const ts = new Date().toISOString();
    const res = await repo.createIfAbsent({
      id: 'del_3',
      event_id: 'evt_del',
      subscriber_id: 'sub_del',
      channel: 'email',
      state: 'invalid_status_xyz',
      created_at: ts,
    });

    expect(res.result).toBe('error');
  });

  test('DB-DEL-4: Claim pending delivery for processing safely', async () => {
    const claimed = await repo.claimForProcessing('del_1', new Date().toISOString());
    expect(claimed).toBe(true);

    const delivery = await repo.findById('del_1');
    expect(delivery?.state).toBe('processing');

    const claimedAgain = await repo.claimForProcessing('del_1', new Date().toISOString());
    expect(claimedAgain).toBe(false); // Already processing
  });

  test('DB-DEL-5: Stuck processing row can be released according to repository contract', async () => {
    await repo.releaseStuckProcessing('del_1', new Date().toISOString());

    const delivery = await repo.findById('del_1');
    expect(delivery?.state).toBe('pending');
  });
});
