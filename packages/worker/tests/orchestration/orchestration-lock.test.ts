/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrchestrationLockRepository } from '../../src/db/repositories/OrchestrationLockRepository';
import { OrchestrationLock } from '../../src/orchestration/orchestration-lock';
import { OrchestrationRunRepository } from '../../src/db/repositories/OrchestrationRunRepository';
import { setupTestDb } from '../db/test-utils';

describe('OrchestrationLock', () => {
  let db: D1Database;
  let lockRepo: OrchestrationLockRepository;
  let runRepo: OrchestrationRunRepository;
  let lock: OrchestrationLock;

  beforeEach(async () => {
    db = await setupTestDb();
    lockRepo = new OrchestrationLockRepository(db);
    runRepo = new OrchestrationRunRepository(db);
    lock = new OrchestrationLock(lockRepo, runRepo);
  });

  it('ORCH-LOCK-1: First run acquires lease', async () => {
    const res = await lock.acquire('run-1', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');
    expect(res).toBe(true);
  });

  it('ORCH-LOCK-2: Concurrent second run returns skipped_overlap', async () => {
    await lock.acquire('run-1', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');
    // Lock is held by run-1. Second run attempts to acquire
    const res2 = await lock.acquire('run-2', '2026-07-18T10:00:30Z', '2026-07-18T10:01:30Z');
    // OrchestrationRunner will interpret false as skipped_overlap.
    expect(res2).toBe(false);
  });

  it('ORCH-LOCK-3: Expired lease can be acquired by a new run', async () => {
    await lock.acquire('run-1', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');
    // run-2 tries at 10:02 (after run-1's lease expired at 10:01)
    const res2 = await lock.acquire('run-2', '2026-07-18T10:02:00Z', '2026-07-18T10:03:00Z');
    expect(res2).toBe(true);
  });

  it('ORCH-LOCK-4: Only owner_run_id may release', async () => {
    await lock.acquire('run-1', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');
    const relFalse = await lock.release('run-wrong-owner');
    expect(relFalse).toBe(false);
    const relTrue = await lock.release('run-1');
    expect(relTrue).toBe(true);
  });

  it('ORCH-LOCK-5: Worker crash cannot create permanent lock', async () => {
    // Acquire lock and simulate crash by not releasing it.
    await lock.acquire('run-crashed', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');

    // A future run attempts to acquire well past the TTL
    const res2 = await lock.acquire('run-next', '2026-07-18T11:00:00Z', '2026-07-18T11:01:00Z');
    expect(res2).toBe(true); // Proves lock isn't permanent, TTL cleared it
  });

  it('ORCH-LOCK-6: Unrelated database failure is not classified as overlap', async () => {
    const errorRepo = {
      acquire: vi.fn().mockResolvedValue({ outcome: 'failed', error: new Error('DB DOWN') }),
      release: vi.fn(),
    };
    const badLock = new OrchestrationLock(errorRepo as any, runRepo);
    await expect(
      badLock.acquire('run-1', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z')
    ).rejects.toThrow('Database failure while acquiring lock');
  });

  it('ORCH-LOCK-7: Scheduled and admin runs use the same lock name/repository', async () => {
    // Ensure that lock name defaults to global_orchestration.
    const implicitLock = new OrchestrationLock(lockRepo, runRepo);
    expect((implicitLock as any).lockName).toBe('global_orchestration');

    // Admin routes and worker scheduled both inject the default lock. We verify they conflict on the same name.
    await implicitLock.acquire('scheduled-run', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');

    const adminLock = new OrchestrationLock(lockRepo, runRepo);
    const adminAcquire = await adminLock.acquire(
      'admin-run',
      '2026-07-18T10:00:10Z',
      '2026-07-18T10:01:10Z'
    );
    expect(adminAcquire).toBe(false); // They overlap because they use the same repository and name
  });

  it('LOCK-ADDITIONAL: Already-inactive release behavior', async () => {
    // Releasing a lock that no one holds
    const rel = await lock.release('run-nonexistent');
    expect(rel).toBe(false);
  });
});
