import { describe, it, expect, beforeEach } from 'vitest';
import { OrchestrationLockRepository } from '../../src/db/repositories/OrchestrationLockRepository';
import { setupTestDb } from '../db/test-utils';

describe('OrchestrationLockRepository', () => {
  let db: D1Database;
  let repo: OrchestrationLockRepository;

  beforeEach(async () => {
    db = await setupTestDb();
    repo = new OrchestrationLockRepository(db);
  });

  it('ORCH-1: acquires a lock when none exists', async () => {
    const res = await repo.acquire('global', 'run-1', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');
    expect(res.outcome).toBe('acquired');
  });

  it('ORCH-2: rejects lock if active lease exists', async () => {
    await repo.acquire('global', 'run-1', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');
    const res = await repo.acquire('global', 'run-2', '2026-07-18T10:00:30Z', '2026-07-18T10:01:30Z');
    expect(res.outcome).toBe('already_running');
  });

  it('ORCH-3: takes over lock if expired, returning previous owner', async () => {
    await repo.acquire('global', 'run-1', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');
    const res = await repo.acquire('global', 'run-2', '2026-07-18T10:02:00Z', '2026-07-18T10:03:00Z');
    expect(res.outcome).toBe('acquired');
    if (res.outcome === 'acquired') {
      expect(res.previousOwnerId).toBe('run-1');
    }
  });

  it('ORCH-4: successfully releases lock if owner matches', async () => {
    await repo.acquire('global', 'run-1', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');
    const rel = await repo.release('global', 'run-1');
    expect(rel).toBe(true);
    
    // Now someone else can acquire
    const res2 = await repo.acquire('global', 'run-2', '2026-07-18T10:00:30Z', '2026-07-18T10:01:30Z');
    expect(res2.outcome).toBe('acquired');
  });

  it('ORCH-5: fails to release lock if owner mismatch', async () => {
    await repo.acquire('global', 'run-1', '2026-07-18T10:00:00Z', '2026-07-18T10:01:00Z');
    const rel = await repo.release('global', 'wrong-owner');
    expect(rel).toBe(false);
  });
});
