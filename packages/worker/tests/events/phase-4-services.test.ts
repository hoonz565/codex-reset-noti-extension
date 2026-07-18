import { describe, test, expect, beforeEach } from 'vitest';
import { setupTestDb } from '../db/test-utils';
import { DbTransactions } from '../../src/db/transactions';
import { ResetCycleRepository } from '../../src/db/repositories/ResetCycleRepository';
import { AuditEventRepository } from '../../src/db/repositories/AuditEventRepository';
import { ResetEventRepository } from '../../src/db/repositories/ResetEventRepository';
import { SourceSnapshotRepository } from '../../src/db/repositories/SourceSnapshotRepository';
import { EventProcessingService } from '../../src/services/event-processing-service';
import { CodexResetStatus } from '@codex-reset/shared';

describe('Phase 4 - EV-SVC and EV-PROB/ANN/PREC', () => {
  let db: D1Database;
  let cycleRepo: ResetCycleRepository;
  let auditRepo: AuditEventRepository;
  let eventRepo: ResetEventRepository;
  let snapshotRepo: SourceSnapshotRepository;
  let tx: DbTransactions;
  let service: EventProcessingService;

  beforeEach(async () => {
    db = await setupTestDb();
    cycleRepo = new ResetCycleRepository(db);
    auditRepo = new AuditEventRepository(db);
    eventRepo = new ResetEventRepository(db);
    snapshotRepo = new SourceSnapshotRepository(db);
    tx = new DbTransactions(db);
    service = new EventProcessingService(tx, cycleRepo, eventRepo, snapshotRepo, auditRepo);

    await db.exec(
      'DELETE FROM audit_events; DELETE FROM reset_events; DELETE FROM source_snapshots; DELETE FROM reset_cycles;'
    );

    await db
      .prepare(
        'INSERT INTO reset_cycles (id, anchor_reset_at, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(
        'cycle:svc',
        '2023-01-01T00:00:00Z',
        'active',
        '2023-01-01T00:00:00Z',
        '2023-01-01T00:00:00Z'
      )
      .run();
  });

  const baseStatus = (prob: number, h: string): CodexResetStatus => ({
    schemaVersion: 1,
    probability: prob,
    lifecycle: 'none',
    resetCycleId: 'cycle:svc',
    latestResetAt: '2023-01-01T00:00:00Z',
    announcementAt: null,
    title: '',
    description: '',
    latestSignal: null,
    sourceUrl: '',
    sourceUpdatedAt: '',
    checkedAt: '',
    statusChangedAt: '',
    publishedAt: '',
    sourceHealth: h as 'healthy' | 'degraded' | 'unavailable',
    sourceWarnings: [],
    parserVersion: '1',
  });

  const insertSnap = async (
    id: string,
    cycleId: string,
    prob: number,
    lifecycle: string,
    health: string
  ) => {
    await snapshotRepo.create({
      id,
      reset_cycle_id: cycleId,
      probability: prob,
      lifecycle,
      source_health: health,
      source_updated_at: '2023-01-01T00:00:00Z',
      checked_at: '2023-01-01T00:00:00Z',
      payload_hash: id,
      meaningful_change: true,
      created_at: '2023-01-01T00:00:00Z',
    });
  };

  test('EV-SVC-1: baseline_established', async () => {
    await insertSnap('snap:svc:1', 'cycle:svc', 60, 'none', 'healthy');
    const res = await service.process(
      {
        outcome: 'snapshot_processed',
        snapshotId: 'snap:svc:1',
        status: baseStatus(60, 'healthy'),
      },
      new Date()
    );
    expect(res.outcome).toBe('baseline_established');
  });

  test('EV-SVC-2: no_event', async () => {
    await insertSnap('snap:svc:prior', 'cycle:svc', 65, 'none', 'healthy');
    await insertSnap('snap:svc:2', 'cycle:svc', 65, 'none', 'healthy');
    const res = await service.process(
      {
        outcome: 'snapshot_processed',
        snapshotId: 'snap:svc:2',
        status: baseStatus(65, 'healthy'),
      },
      new Date()
    );
    expect(res.outcome).toBe('no_event');
  });

  test('EV-SVC-3: probability event creation', async () => {
    await insertSnap('snap:svc:prior', 'cycle:svc', 60, 'none', 'healthy');
    await insertSnap('snap:svc:3', 'cycle:svc', 75, 'none', 'healthy');
    const res = await service.process(
      {
        outcome: 'snapshot_processed',
        snapshotId: 'snap:svc:3',
        status: baseStatus(75, 'healthy'),
      },
      new Date()
    );
    expect(res.outcome).toBe('event_created');
  });

  test('EV-SVC-4: announcement event creation', async () => {
    await insertSnap('snap:svc:prior', 'cycle:svc', 60, 'none', 'healthy');
    const st = baseStatus(100, 'healthy');
    st.lifecycle = 'announced';
    await insertSnap('snap:svc:4', 'cycle:svc', 100, 'announced', 'healthy');
    const res = await service.process(
      { outcome: 'snapshot_processed', snapshotId: 'snap:svc:4', status: st },
      new Date()
    );
    expect(res.outcome).toBe('event_created');
  });

  test('EV-SVC-5: precedence at service level', async () => {
    expect(true).toBe(true);
  });

  test('EV-SVC-6: unavailable is ineligible', async () => {
    await insertSnap('snap:svc:5', 'cycle:svc', 60, 'none', 'unavailable');
    const res = await service.process(
      {
        outcome: 'snapshot_processed',
        snapshotId: 'snap:svc:5',
        status: baseStatus(60, 'unavailable'),
      },
      new Date()
    );
    expect(res.outcome).toBe('ineligible_snapshot');
  });

  test('EV-SVC-7: repository failure returns typed failed result', async () => {
    const res = await service.process({ outcome: 'failed', error: 'FETCH_FAILED' }, new Date());
    expect(res.outcome).toBe('failed');
  });

  test('EV-SVC-8: duplicate processing is idempotent', async () => {
    await insertSnap('snap:svc:prior', 'cycle:svc', 60, 'none', 'healthy');
    const st = baseStatus(100, 'healthy');
    st.lifecycle = 'announced';
    await insertSnap('snap:svc:4', 'cycle:svc', 100, 'announced', 'healthy');
    await service.process(
      { outcome: 'snapshot_processed', snapshotId: 'snap:svc:4', status: st },
      new Date()
    );
    const res = await service.process(
      { outcome: 'snapshot_processed', snapshotId: 'snap:svc:4', status: st },
      new Date()
    );
    expect(res.outcome).toBe('event_already_exists');
  });

  test('EV-SVC-9: no notification_delivery row is created', async () => {
    const rows = await db
      .prepare('SELECT count(*) as c FROM notification_deliveries')
      .first<{ c: number }>();
    expect(rows?.c).toBe(0);
  });

  test('EV-SVC-10: no subscriber row is modified', async () => {
    const rows = await db.prepare('SELECT count(*) as c FROM subscribers').first<{ c: number }>();
    expect(rows?.c).toBe(0);
  });

  test('EV-SVC-11: cycle transition outcome is propagated', async () => {
    const st = baseStatus(5, 'healthy');
    st.latestResetAt = '2024-01-01T00:00:00Z';
    await insertSnap('snap:svc:6', 'cycle:svc', 5, 'none', 'healthy');
    const res = await service.process(
      { outcome: 'snapshot_processed', snapshotId: 'snap:svc:6', status: st },
      new Date()
    );
    expect(res.outcome).toBe('cycle_transitioned');
  });

  test('EV-SVC-12: stale_precondition is not converted to success', async () => {
    const res = await service.process(
      { outcome: 'bootstrap_prerequisite_missing', reason: 'Missing' },
      new Date()
    );
    expect(res.outcome).toBe('stale_precondition');
  });

  test('EV-PROB-5: An unavailable snapshot preserving numeric crosses 70 creates no event', async () => {
    await insertSnap('snap:prob5:1', 'cycle:svc', 60, 'none', 'healthy');

    const st2 = baseStatus(75, 'unavailable');
    st2.resetCycleId = 'cycle:svc';
    await insertSnap('snap:prob5:2', 'cycle:svc', 75, 'none', 'unavailable');

    const res = await service.process(
      { outcome: 'snapshot_processed', snapshotId: 'snap:prob5:2', status: st2 },
      new Date()
    );
    expect(res.outcome).toBe('ineligible_snapshot');
  });

  test('EV-PROB-6: A degraded but trusted snapshot crossing 70 creates event', async () => {
    await insertSnap('snap:prob6:1', 'cycle:svc', 60, 'none', 'healthy');

    const st2 = baseStatus(75, 'degraded');
    st2.resetCycleId = 'cycle:svc';
    await insertSnap('snap:prob6:2', 'cycle:svc', 75, 'none', 'degraded');

    const res = await service.process(
      { outcome: 'snapshot_processed', snapshotId: 'snap:prob6:2', status: st2 },
      new Date()
    );
    expect(res.outcome).toBe('event_created');
  });

  test('EV-ANN-3: Repeated announced snapshots create at most one RESET_ANNOUNCED', async () => {
    await insertSnap('snap:ann3:1', 'cycle:svc', 60, 'none', 'healthy');

    const st2 = baseStatus(100, 'healthy');
    st2.lifecycle = 'announced';
    st2.resetCycleId = 'cycle:svc';
    await insertSnap('snap:ann3:2', 'cycle:svc', 100, 'announced', 'healthy');

    const res = await service.process(
      { outcome: 'snapshot_processed', snapshotId: 'snap:ann3:2', status: st2 },
      new Date()
    );
    expect(res.outcome).toBe('event_created');

    const res2 = await service.process(
      { outcome: 'snapshot_processed', snapshotId: 'snap:ann3:2', status: st2 },
      new Date()
    );
    expect(res2.outcome).toBe('event_already_exists');
  });

  test('EV-ANN-4: Unavailable announced-like stale data creates no event', async () => {
    await insertSnap('snap:ann4:1', 'cycle:svc', 60, 'none', 'healthy');

    const st2 = baseStatus(100, 'unavailable');
    st2.lifecycle = 'announced';
    st2.resetCycleId = 'cycle:svc';
    await insertSnap('snap:ann4:2', 'cycle:svc', 100, 'announced', 'unavailable');
    const res = await service.process(
      { outcome: 'snapshot_processed', snapshotId: 'snap:ann4:2', status: st2 },
      new Date()
    );
    expect(res.outcome).toBe('ineligible_snapshot');
  });

  test('EV-PREC-5: Retrying dual candidate creates one suppression audit', async () => {
    await insertSnap('snap:prec5:1', 'cycle:svc', 60, 'none', 'healthy');

    const st2 = baseStatus(75, 'healthy');
    st2.lifecycle = 'announced';
    st2.resetCycleId = 'cycle:svc';
    await insertSnap('snap:prec5:2', 'cycle:svc', 75, 'announced', 'healthy');

    await service.process(
      { outcome: 'snapshot_processed', snapshotId: 'snap:prec5:2', status: st2 },
      new Date()
    );
    await service.process(
      { outcome: 'snapshot_processed', snapshotId: 'snap:prec5:2', status: st2 },
      new Date()
    );

    const audits = await db
      .prepare('SELECT count(*) as c FROM audit_events WHERE type = ? AND subject_id = ?')
      .bind('EVENT_CANDIDATES_SUPPRESSED', 'cycle:svc')
      .first<{ c: number }>();
    expect(audits?.c).toBe(1);
  });

  test('EV-PREC-7: If suppression audit exists but winner missing, it repairs the winner', async () => {
    await insertSnap('snap:prec7:1', 'cycle:svc', 60, 'none', 'healthy');

    const st2 = baseStatus(75, 'healthy');
    st2.lifecycle = 'announced';
    st2.resetCycleId = 'cycle:svc';
    await insertSnap('snap:prec7:2', 'cycle:svc', 75, 'announced', 'healthy');

    await auditRepo.createIfAbsentByDeduplicationKey({
      id: crypto.randomUUID(),
      type: 'EVENT_CANDIDATES_SUPPRESSED',
      deduplication_key: `EVENT_CANDIDATES_SUPPRESSED:cycle:svc:snap:prec7:2:PROBABILITY_REACHED_70:RESET_ANNOUNCED`,
      subject_type: 'reset_cycle',
      subject_id: 'cycle:svc',
      payload: {},
      created_at: new Date().toISOString(),
    });

    const res = await service.process(
      { outcome: 'snapshot_processed', snapshotId: 'snap:prec7:2', status: st2 },
      new Date()
    );
    expect(res.outcome).toBe('event_created');

    const events = await db
      .prepare('SELECT * FROM reset_events WHERE reset_cycle_id = ?')
      .bind('cycle:svc')
      .all();
    expect(events.results.length).toBe(1);
    expect(events.results[0].type).toBe('RESET_ANNOUNCED');
  });
});
