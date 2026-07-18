import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestDb } from './test-utils';
import {
  DbTransactions,
  ResetCycleRepository,
  SourceSnapshotRepository,
  SubscriberRepository,
  ResetEventRepository,
  NotificationDeliveryRepository,
} from '../../src/db';
import * as crypto from 'crypto';

describe('Database Transactions', () => {
  let db: D1Database;
  let tx: DbTransactions;
  let cycleRepo: ResetCycleRepository;
  let snapRepo: SourceSnapshotRepository;
  let subRepo: SubscriberRepository;
  let evtRepo: ResetEventRepository;
  let delRepo: NotificationDeliveryRepository;

  beforeAll(async () => {
    db = await setupTestDb();
    tx = new DbTransactions(db);
    cycleRepo = new ResetCycleRepository(db);
    snapRepo = new SourceSnapshotRepository(db);
    subRepo = new SubscriberRepository(db);
    evtRepo = new ResetEventRepository(db);
    delRepo = new NotificationDeliveryRepository(db);

    await cycleRepo.create({
      id: 'cycle:old',
      anchor_reset_at: null,
      state: 'active',
      created_at: new Date().toISOString(),
    });
  });

  test('DB-TX-1: Successful cycle-transition transaction commits all rows', async () => {
    const ts = new Date().toISOString();
    const snapId = crypto.randomUUID();

    await snapRepo.create({
      id: snapId,
      reset_cycle_id: 'cycle:old',
      probability: 0,
      lifecycle: 'none',
      source_health: 'healthy',
      source_updated_at: ts,
      checked_at: ts,
      payload_hash: 'hash_tx_1',
      meaningful_change: true,
      created_at: ts,
    });

    await tx.performCycleTransition(
      {
        id: crypto.randomUUID(),
        type: 'RESET_COMPLETED',
        deduplication_key: 'dedup_tx_1',
        subject_type: 'cycle',
        subject_id: 'cycle:old',
        payload: null,
        created_at: ts,
      },
      'cycle:old',
      ts,
      {
        id: 'cycle:new',
        anchor_reset_at: ts,
        state: 'active',
        created_at: ts,
      },
      snapId
    );

    const oldCycle = await cycleRepo.findById('cycle:old');
    expect(oldCycle?.state).toBe('completed');

    const newCycle = await cycleRepo.findActive();
    expect(newCycle?.id).toBe('cycle:new');

    const snap = await snapRepo.findById(snapId);
    expect(snap?.reset_cycle_id).toBe('cycle:new');
  });

  test('DB-TX-2: Failure during cycle transition rolls back all rows', async () => {
    const ts = new Date().toISOString();
    const snapId = crypto.randomUUID();

    await snapRepo.create({
      id: snapId,
      reset_cycle_id: 'cycle:new',
      probability: 0,
      lifecycle: 'none',
      source_health: 'healthy',
      source_updated_at: ts,
      checked_at: ts,
      payload_hash: 'hash_tx_2',
      meaningful_change: true,
      created_at: ts,
    });

    // Make the snapshot ID invalid for UPDATE so we can simulate failure,
    // Wait, D1 doesn't throw on 0 rows updated for UPDATE.
    // To trigger a throw, we need an invalid audit event ID or similar?
    // Actually, passing an existing cycle ID as newCycle ID will throw due to primary key conflict.
    // Pre-insert an audit event to cause PK violation
    await db
      .prepare(
        `INSERT INTO audit_events (id, type, created_at) VALUES ('duplicate_id', 'RESET_COMPLETED', ?)`
      )
      .bind(ts)
      .run();

    await expect(
      tx.performCycleTransition(
        {
          id: 'duplicate_id', // Causes PK violation!
          type: 'RESET_COMPLETED',
          deduplication_key: 'dedup_tx_2',
          subject_type: 'cycle',
          subject_id: 'cycle:new',
          payload: null,
          created_at: ts,
        },
        'cycle:new',
        ts,
        {
          id: 'cycle:fail',
          anchor_reset_at: ts,
          state: 'active',
          created_at: ts,
        },
        snapId
      )
    ).rejects.toThrow();

    // Verify rollback
    const activeCycle = await cycleRepo.findActive();
    expect(activeCycle?.id).toBe('cycle:new'); // cycle:new still active

    const snap = await snapRepo.findById(snapId);
    expect(snap?.reset_cycle_id).toBe('cycle:new'); // Unchanged
  });

  test('DB-TX-3: Subscriber event plus delivery creation commits atomically', async () => {
    const ts = new Date().toISOString();

    await subRepo
      .getCreateStatement({
        id: 'sub_tx',
        email: 'tx@ex.com',
        normalized_email: 'tx@ex.com',
        state: 'active',
        notify_70: true,
        notify_announced: true,
        management_token_hash: 'hash',
        created_at: ts,
      })
      .run();

    const evtId = crypto.randomUUID();
    const delId = crypto.randomUUID();

    await snapRepo.create({
      id: 'snap:tx_3',
      reset_cycle_id: 'cycle:new',
      probability: 75,
      lifecycle: 'announced',
      source_health: 'healthy',
      source_updated_at: ts,
      checked_at: ts,
      payload_hash: 'hx',
      meaningful_change: true,
      created_at: ts,
    });

    await tx.createSubscriberEventAndDelivery(
      {
        id: evtId,
        reset_cycle_id: 'cycle:new',
        type: 'PROBABILITY_REACHED_70',
        threshold: 70,
        previous_probability: 60,
        current_probability: 75,
        source_signal_id: null,
        source_snapshot_id: 'snap:tx_3',
        created_at: ts,
      },
      {
        id: delId,
        event_id: evtId,
        subscriber_id: 'sub_tx',
        channel: 'email',
        state: 'pending',
        created_at: ts,
      }
    );

    const evt = await evtRepo.findByCycleAndType('cycle:new', 'PROBABILITY_REACHED_70');
    expect(evt?.id).toBe(evtId);

    const del = await delRepo.findById(delId);
    expect(del?.event_id).toBe(evtId);
  });

  test('DB-TX-4: Failure while creating deliveries rolls back the subscriber event', async () => {
    const ts = new Date().toISOString();
    const evtId = crypto.randomUUID();
    const delId = crypto.randomUUID();

    await snapRepo.create({
      id: 'snap:tx_4',
      reset_cycle_id: 'cycle:new',
      probability: 75,
      lifecycle: 'announced',
      source_health: 'healthy',
      source_updated_at: ts,
      checked_at: ts,
      payload_hash: 'hx2',
      meaningful_change: true,
      created_at: ts,
    });

    await expect(
      tx.createSubscriberEventAndDelivery(
        {
          id: evtId,
          reset_cycle_id: 'cycle:new',
          type: 'RESET_ANNOUNCED',
          threshold: null,
          previous_probability: 75,
          current_probability: 75,
          source_signal_id: null,
          source_snapshot_id: 'snap:tx_4',
          created_at: ts,
        },
        {
          id: delId,
          event_id: evtId,
          subscriber_id: 'sub_does_not_exist', // Causes FK violation
          channel: 'email',
          state: 'pending',
          created_at: ts,
        }
      )
    ).rejects.toThrow();

    // Verify rollback
    const evt = await evtRepo.findByCycleAndType('cycle:new', 'RESET_ANNOUNCED');
    expect(evt).toBeNull();
  });

  test('DB-TX-5: Cycle A is no longer active before transition execution -> no transition rows are committed', async () => {
    const ts = new Date().toISOString();
    const snapId = crypto.randomUUID();
    await snapRepo.create({
      id: snapId,
      reset_cycle_id: 'cycle:old',
      probability: 0,
      lifecycle: 'none',
      source_health: 'healthy',
      source_updated_at: ts,
      checked_at: ts,
      payload_hash: 'hx5',
      meaningful_change: true,
      created_at: ts,
    });

    const result = await tx.performCycleTransition(
      {
        id: crypto.randomUUID(),
        type: 'RESET_COMPLETED',
        deduplication_key: 'dedup_tx_5',
        subject_type: 'cycle',
        subject_id: 'cycle:old',
        payload: null,
        created_at: ts,
      },
      'cycle:old', // already completed!
      ts,
      { id: 'cycle:5', anchor_reset_at: ts, state: 'active', created_at: ts },
      snapId
    );

    expect(result.outcome).toBe('stale_precondition');

    const cycle5 = await cycleRepo.findById('cycle:5');
    expect(cycle5).toBeNull();
    const snap5 = await snapRepo.findById(snapId);
    expect(snap5?.reset_cycle_id).not.toBe('cycle:5');
  });

  test('DB-TX-6: Two competing transitions from the same Cycle A -> exactly one succeeds', async () => {
    const ts = new Date().toISOString();

    const snap1 = crypto.randomUUID();
    const snap2 = crypto.randomUUID();

    await snapRepo.create({
      id: snap1,
      reset_cycle_id: 'cycle:new',
      probability: 0,
      lifecycle: 'none',
      source_health: 'healthy',
      source_updated_at: ts,
      checked_at: ts,
      payload_hash: 'h_6_1',
      meaningful_change: true,
      created_at: ts,
    });

    await snapRepo.create({
      id: snap2,
      reset_cycle_id: 'cycle:new',
      probability: 0,
      lifecycle: 'none',
      source_health: 'healthy',
      source_updated_at: ts,
      checked_at: ts,
      payload_hash: 'h_6_2',
      meaningful_change: true,
      created_at: ts,
    });

    const t1 = tx.performCycleTransition(
      {
        id: crypto.randomUUID(),
        type: 'RESET_COMPLETED',
        deduplication_key: 'dedup_tx_6_1',
        subject_type: 'cycle',
        subject_id: 'cycle:new',
        payload: null,
        created_at: ts,
      },
      'cycle:new',
      ts,
      { id: 'cycle:tx6_new_1', anchor_reset_at: ts, state: 'active', created_at: ts },
      snap1
    );

    const t2 = tx.performCycleTransition(
      {
        id: crypto.randomUUID(),
        type: 'RESET_COMPLETED',
        deduplication_key: 'dedup_tx_6_2',
        subject_type: 'cycle',
        subject_id: 'cycle:new',
        payload: null,
        created_at: ts,
      },
      'cycle:new',
      ts,
      { id: 'cycle:tx6_new_2', anchor_reset_at: ts, state: 'active', created_at: ts },
      snap2
    );

    const results = await Promise.all([t1, t2]);

    const successes = results.filter((r) => r.outcome === 'transitioned');
    const failures = results.filter(
      (r) => r.outcome === 'stale_precondition' || r.outcome === 'already_transitioned'
    );

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
  });

  test('DB-TX-7: Successful transition preserves valid ISO updated_at; ownership is in transition_token only', async () => {
    const ts = new Date().toISOString();

    const currentActive = await cycleRepo.findActive();
    if (currentActive) {
      await cycleRepo.markCompletedOrSuperseded(currentActive.id, 'completed', ts, ts);
    }

    await cycleRepo.create({
      id: 'cycle:tx7_src',
      anchor_reset_at: null,
      state: 'active',
      created_at: ts,
    });

    const snapId = crypto.randomUUID();
    await snapRepo.create({
      id: snapId,
      reset_cycle_id: 'cycle:tx7_src',
      probability: 0,
      lifecycle: 'none',
      source_health: 'healthy',
      source_updated_at: ts,
      checked_at: ts,
      payload_hash: 'h_tx7',
      meaningful_change: true,
      created_at: ts,
    });

    const result = await tx.performCycleTransition(
      {
        id: crypto.randomUUID(),
        type: 'RESET_COMPLETED',
        deduplication_key: 'dedup_tx_7',
        subject_type: 'cycle',
        subject_id: 'cycle:tx7_src',
        payload: null,
        created_at: ts,
      },
      'cycle:tx7_src',
      ts,
      { id: 'cycle:tx7_new', anchor_reset_at: ts, state: 'active', created_at: ts },
      snapId
    );

    expect(result.outcome).toBe('transitioned');

    const completedCycle = await cycleRepo.findById('cycle:tx7_src');
    expect(completedCycle).not.toBeNull();
    expect(completedCycle!.updated_at).not.toContain('#');
    expect(new Date(completedCycle!.updated_at).toISOString()).toBe(completedCycle!.updated_at);
    expect(completedCycle!.transition_token).not.toBeNull();
    expect(typeof completedCycle!.transition_token).toBe('string');
    expect(completedCycle!.transition_token).not.toContain('#');
    expect(completedCycle!.transition_token).not.toBe(completedCycle!.updated_at);
  });

  test('DB-TX-8: Duplicate execution of the exact same transition returns already_transitioned', async () => {
    const ts = new Date().toISOString();

    const currentActive = await cycleRepo.findActive();
    if (currentActive) {
      await cycleRepo.markCompletedOrSuperseded(currentActive.id, 'completed', ts, ts);
    }

    await cycleRepo.create({
      id: 'cycle:tx8_src',
      anchor_reset_at: null,
      state: 'active',
      created_at: ts,
    });

    const snapId = crypto.randomUUID();
    await snapRepo.create({
      id: snapId,
      reset_cycle_id: 'cycle:tx8_src',
      probability: 0,
      lifecycle: 'none',
      source_health: 'healthy',
      source_updated_at: ts,
      checked_at: ts,
      payload_hash: 'h_tx8',
      meaningful_change: true,
      created_at: ts,
    });

    const auditParams = {
      id: crypto.randomUUID(),
      type: 'RESET_COMPLETED' as const,
      deduplication_key: 'dedup_tx_8_exact',
      subject_type: 'cycle',
      subject_id: 'cycle:tx8_src',
      payload: null,
      created_at: ts,
    };
    const newCycleParams = {
      id: 'cycle:tx8_new',
      anchor_reset_at: ts,
      state: 'active',
      created_at: ts,
    };

    const r1 = await tx.performCycleTransition(
      auditParams,
      'cycle:tx8_src',
      ts,
      newCycleParams,
      snapId
    );
    expect(r1.outcome).toBe('transitioned');

    const r2 = await tx.performCycleTransition(
      auditParams,
      'cycle:tx8_src',
      ts,
      newCycleParams,
      snapId
    );
    expect(r2.outcome).toBe('already_transitioned');
  });

  test('DB-TX-9: Unrelated unique constraint failure surfaces as a thrown error, not already_transitioned', async () => {
    const ts = new Date().toISOString();

    const currentActive = await cycleRepo.findActive();
    if (currentActive) {
      await cycleRepo.markCompletedOrSuperseded(currentActive.id, 'completed', ts, ts);
    }

    await cycleRepo.create({
      id: 'cycle:tx9_src',
      anchor_reset_at: null,
      state: 'active',
      created_at: ts,
    });

    await db
      .prepare(
        `INSERT INTO audit_events (id, type, deduplication_key, subject_type, subject_id, created_at)
         VALUES (?, 'RESET_COMPLETED', 'dedup_tx_9_collision', 'cycle', 'some_other_cycle', ?)`
      )
      .bind(crypto.randomUUID(), ts)
      .run();

    const snapId = crypto.randomUUID();
    await snapRepo.create({
      id: snapId,
      reset_cycle_id: 'cycle:tx9_src',
      probability: 0,
      lifecycle: 'none',
      source_health: 'healthy',
      source_updated_at: ts,
      checked_at: ts,
      payload_hash: 'h_tx9',
      meaningful_change: true,
      created_at: ts,
    });

    await expect(
      tx.performCycleTransition(
        {
          id: crypto.randomUUID(),
          type: 'RESET_COMPLETED',
          deduplication_key: 'dedup_tx_9_collision',
          subject_type: 'cycle',
          subject_id: 'cycle:tx9_src',
          payload: null,
          created_at: ts,
        },
        'cycle:tx9_src',
        ts,
        { id: 'cycle:tx9_new', anchor_reset_at: ts, state: 'active', created_at: ts },
        snapId
      )
    ).rejects.toThrow();
  });
});
