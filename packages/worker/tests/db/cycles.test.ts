import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestDb } from './test-utils';
import { ResetCycleRepository } from '../../src/db';

describe('Reset Cycle Repository', () => {
  let db: D1Database;
  let repo: ResetCycleRepository;

  beforeAll(async () => {
    db = await setupTestDb();
    repo = new ResetCycleRepository(db);
  });

  test('DB-CYCLE-1: Create active cycle', async () => {
    const { result } = await repo.create({
      id: 'cycle:genesis',
      anchor_reset_at: null,
      state: 'active',
      created_at: new Date().toISOString(),
    });
    expect(result).toBe('inserted');

    const active = await repo.findActive();
    expect(active?.id).toBe('cycle:genesis');
  });

  test('DB-CYCLE-2: Second active cycle violates invariant or is prevented atomically', async () => {
    // Relying on the SQLite partial index UNIQUE(state) WHERE state = 'active'
    await expect(
      repo.create({
        id: 'cycle:2026',
        anchor_reset_at: null,
        state: 'active',
        created_at: new Date().toISOString(),
      })
    ).resolves.toEqual({ result: 'error' }); // Because the partial index throws a constraint violation
  });

  test('DB-CYCLE-3: Mark active cycle completed/superseded', async () => {
    await repo.markCompletedOrSuperseded(
      'cycle:genesis',
      'completed',
      new Date().toISOString(),
      new Date().toISOString()
    );
    const active = await repo.findActive();
    expect(active).toBeNull(); // No active cycle now
  });

  test('DB-CYCLE-4: Cycle retry is idempotent', async () => {
    const ts = new Date().toISOString();
    const { result: r1 } = await repo.create({
      id: 'cycle:retry',
      anchor_reset_at: null,
      state: 'active',
      created_at: ts,
    });
    expect(r1).toBe('inserted');

    const { result: r2 } = await repo.create({
      id: 'cycle:retry', // Same ID
      anchor_reset_at: null,
      state: 'active', // Doesn't matter, ID conflict hits first
      created_at: ts,
    });
    expect(r2).toBe('already_exists'); // Handled by ON CONFLICT(id) DO NOTHING
  });
});
