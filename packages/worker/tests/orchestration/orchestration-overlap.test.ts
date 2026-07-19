/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrchestrationLockRepository } from '../../src/db/repositories/OrchestrationLockRepository';
import { setupTestDb } from '../db/test-utils';

describe('Orchestration Overlap & Locks', () => {
  let db: D1Database;
  let repo: OrchestrationLockRepository;

  beforeEach(async () => {
    db = await setupTestDb();
    repo = new OrchestrationLockRepository(db);
  });

  it('ORCH-LOCK-1: first invocation successfully acquires the lease', async () => {
    const res = await repo.acquire(
      'global',
      'run-1',
      '2026-07-18T10:00:00Z',
      '2026-07-18T10:01:00Z'
    );
    expect(res.outcome).toBe('acquired');
  });

  it('ORCH-LOCK-2: concurrent invocation receives skipped_overlap equivalent (already_running)', async () => {
    await repo.acquire('global', 'run-1', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');
    const res = await repo.acquire(
      'global',
      'run-2',
      '2026-07-18T10:00:30Z',
      '2026-07-18T10:01:30Z'
    );
    expect(res.outcome).toBe('already_running');
  });

  it('ORCH-LOCK-3: expired lease is atomically taken over', async () => {
    await repo.acquire('global', 'run-1', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');
    const res = await repo.acquire(
      'global',
      'run-2',
      '2026-07-18T10:02:00Z',
      '2026-07-18T10:03:00Z'
    );
    expect(res.outcome).toBe('acquired');
    expect((res as any).previousOwnerId).toBe('run-1');
  });

  it('ORCH-LOCK-4: only matching owner_run_id can release the lock', async () => {
    await repo.acquire('global', 'run-1', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');
    const releasedWrong = await repo.release('global', 'run-wrong');
    expect(releasedWrong).toBe(false);
    const releasedRight = await repo.release('global', 'run-1');
    expect(releasedRight).toBe(true);
  });

  it('ORCH-LOCK-5: DB error during lock is not classified as overlap but as a critical error', async () => {
    const fakeDb = {
      prepare: () => ({
        bind: () => ({
          first: () => {
            throw new Error('D1_ERROR');
          },
        }),
      }),
    };
    const badRepo = new OrchestrationLockRepository(fakeDb as any);
    const result = await badRepo.acquire(
      'global',
      'run-1',
      '2026-07-18T10:00:00Z',
      '2026-07-18T10:01:00Z'
    );
    expect(result.outcome).toBe('error');
    expect((result as any).error.message).toBe('D1_ERROR');
  });

  it('ORCH-LOCK-6: admin and scheduled runs share the same lock resource', async () => {
    // Both use the same 'global' lock name in the factory, effectively colliding
    await repo.acquire('global', 'admin-run', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');
    const res = await repo.acquire(
      'global',
      'sched-run',
      '2026-07-18T10:00:10Z',
      '2026-07-18T10:01:10Z'
    );
    expect(res.outcome).toBe('already_running');
  });

  it('ORCH-LOCK-7: crash cannot create a permanent lock (handled by bounded expires_at)', async () => {
    // Simulating a crash by not calling release.
    await repo.acquire('global', 'crash-run', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');
    // Future run at 10:02:00 takes it over securely
    const res = await repo.acquire(
      'global',
      'future-run',
      '2026-07-18T10:02:00Z',
      '2026-07-18T10:03:00Z'
    );
    expect(res.outcome).toBe('acquired');
  });
});
