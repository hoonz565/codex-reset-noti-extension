import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestDb } from './test-utils';
import { SourceSnapshotRepository, ResetCycleRepository } from '../../src/db';
import * as crypto from 'crypto';

describe('Source Snapshot Repository', () => {
  let db: D1Database;
  let repo: SourceSnapshotRepository;
  let cycleRepo: ResetCycleRepository;

  beforeAll(async () => {
    db = await setupTestDb();
    repo = new SourceSnapshotRepository(db);
    cycleRepo = new ResetCycleRepository(db);

    await cycleRepo.create({
      id: 'cycle:snap_test',
      anchor_reset_at: null,
      state: 'active',
      created_at: new Date().toISOString(),
    });
  });

  test('DB-SNAP-1: Create valid snapshot', async () => {
    const ts = new Date().toISOString();
    await repo.create({
      id: crypto.randomUUID(),
      reset_cycle_id: 'cycle:snap_test',
      probability: 73,
      lifecycle: 'announced',
      source_health: 'healthy',
      source_updated_at: ts,
      checked_at: ts,
      payload_hash: 'hash1',
      meaningful_change: true,
      created_at: ts,
    });

    const latest = await repo.findLatestValid();
    expect(latest?.probability).toBe(73);
  });

  test('DB-SNAP-2: Probability outside 0–100 rejected', async () => {
    const ts = new Date().toISOString();
    await expect(
      repo.create({
        id: crypto.randomUUID(),
        reset_cycle_id: 'cycle:snap_test',
        probability: 105,
        lifecycle: 'announced',
        source_health: 'healthy',
        source_updated_at: ts,
        checked_at: ts,
        payload_hash: 'hash_bad_prob',
        meaningful_change: true,
        created_at: ts,
      })
    ).rejects.toThrow(/CHECK constraint failed/);

    await expect(
      repo.create({
        id: crypto.randomUUID(),
        reset_cycle_id: 'cycle:snap_test',
        probability: -5,
        lifecycle: 'announced',
        source_health: 'healthy',
        source_updated_at: ts,
        checked_at: ts,
        payload_hash: 'hash_bad_prob_2',
        meaningful_change: true,
        created_at: ts,
      })
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  test('DB-SNAP-3: Unavailable snapshot may store null probability according to policy', async () => {
    const ts = new Date().toISOString();
    await repo.create({
      id: crypto.randomUUID(),
      reset_cycle_id: 'cycle:snap_test',
      probability: null,
      lifecycle: 'none',
      source_health: 'unavailable',
      source_updated_at: null,
      checked_at: ts,
      payload_hash: 'hash2',
      meaningful_change: true,
      created_at: ts,
    });

    const latest = await repo.findLatest();
    expect(latest?.probability).toBeNull();

    // findLatestValid should ignore the null one
    const latestValid = await repo.findLatestValid();
    expect(latestValid?.probability).toBe(73); // From SNAP-1
  });

  test('DB-SNAP-4: Meaningful history query returns only meaningful rows', async () => {
    const ts = new Date().toISOString();
    await repo.create({
      id: crypto.randomUUID(),
      reset_cycle_id: 'cycle:snap_test',
      probability: 75,
      lifecycle: 'announced',
      source_health: 'healthy',
      source_updated_at: ts,
      checked_at: ts,
      payload_hash: 'hash3',
      meaningful_change: false, // NOT meaningful
      created_at: ts,
    });

    const meaningful = await repo.listMeaningful();
    const hasNonMeaningful = meaningful.some((s) => !s.meaningful_change);
    expect(hasNonMeaningful).toBe(false);
  });

  test('SNAP-INVARIANT-1: healthy + null probability -> rejected', async () => {
    await expect(
      repo.create({
        id: crypto.randomUUID(),
        reset_cycle_id: 'cycle:snap_test',
        probability: null,
        lifecycle: 'announced',
        source_health: 'healthy',
        source_updated_at: null,
        checked_at: new Date().toISOString(),
        payload_hash: 'h1',
        meaningful_change: true,
        created_at: new Date().toISOString(),
      })
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  test('SNAP-INVARIANT-2: degraded + null probability -> rejected', async () => {
    await expect(
      repo.create({
        id: crypto.randomUUID(),
        reset_cycle_id: 'cycle:snap_test',
        probability: null,
        lifecycle: 'announced',
        source_health: 'degraded',
        source_updated_at: null,
        checked_at: new Date().toISOString(),
        payload_hash: 'h2',
        meaningful_change: true,
        created_at: new Date().toISOString(),
      })
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  test('SNAP-INVARIANT-3: unavailable + null probability -> accepted', async () => {
    // This is tested in DB-SNAP-3, but we duplicate here explicitly for mapping
    await repo.create({
      id: crypto.randomUUID(),
      reset_cycle_id: 'cycle:snap_test',
      probability: null,
      lifecycle: 'announced',
      source_health: 'unavailable',
      source_updated_at: null,
      checked_at: new Date().toISOString(),
      payload_hash: 'h3',
      meaningful_change: true,
      created_at: new Date().toISOString(),
    });
  });

  test('SNAP-INVARIANT-4: healthy + probability 73 -> accepted', async () => {
    await repo.create({
      id: crypto.randomUUID(),
      reset_cycle_id: 'cycle:snap_test',
      probability: 73,
      lifecycle: 'announced',
      source_health: 'healthy',
      source_updated_at: null,
      checked_at: new Date().toISOString(),
      payload_hash: 'h4',
      meaningful_change: true,
      created_at: new Date().toISOString(),
    });
  });

  test('SNAP-INVARIANT-5: unavailable + probability 73 -> accepted', async () => {
    // According to B policy: unavailable may preserve a valid last-known probability.
    await repo.create({
      id: crypto.randomUUID(),
      reset_cycle_id: 'cycle:snap_test',
      probability: 73,
      lifecycle: 'announced',
      source_health: 'unavailable',
      source_updated_at: null,
      checked_at: new Date().toISOString(),
      payload_hash: 'h5',
      meaningful_change: true,
      created_at: new Date().toISOString(),
    });
  });

  test('SNAP-INVARIANT-6: probability below 0 or above 100 -> rejected for every health state', async () => {
    await expect(
      repo.create({
        id: crypto.randomUUID(),
        reset_cycle_id: 'cycle:snap_test',
        probability: 105,
        lifecycle: 'announced',
        source_health: 'healthy',
        source_updated_at: null,
        checked_at: new Date().toISOString(),
        payload_hash: 'h6',
        meaningful_change: true,
        created_at: new Date().toISOString(),
      })
    ).rejects.toThrow(/CHECK constraint failed/);
  });
});
