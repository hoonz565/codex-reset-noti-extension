import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestDb } from './test-utils';
import { SubscriberRepository } from '../../src/db';

describe('Subscriber Repository', () => {
  let db: D1Database;
  let repo: SubscriberRepository;

  beforeAll(async () => {
    db = await setupTestDb();
    repo = new SubscriberRepository(db);
  });

  test('DB-SUB-1: Create and retrieve subscriber', async () => {
    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();

    const res = await repo.createIfNotExists({
      id,
      email: 'test1@example.com',
      normalized_email: 'test1@example.com',
      state: 'pending_confirmation',
      notify_70: true,
      notify_announced: true,
      management_token_hash: 'hash1',
      created_at,
    });

    expect(res.outcome).toBe('inserted');

    const sub = await repo.findById(id);
    expect(sub).toBeDefined();
    expect(sub?.email).toBe('test1@example.com');
  });

  test('DB-SUB-2: Normalized email uniqueness enforced', async () => {
    const created_at = new Date().toISOString();
    const res1 = await repo.createIfNotExists({
      id: crypto.randomUUID(),
      email: 'Test2@Example.com',
      normalized_email: 'test2@example.com',
      state: 'pending_confirmation',
      notify_70: true,
      notify_announced: true,
      management_token_hash: 'hash2',
      created_at,
    });
    expect(res1.outcome).toBe('inserted');

    // Duplicate normalized_email should return already_exists
    const res2 = await repo.createIfNotExists({
      id: crypto.randomUUID(), // different ID
      email: 'test2@example.com',
      normalized_email: 'test2@example.com',
      state: 'pending_confirmation',
      notify_70: true,
      notify_announced: true,
      management_token_hash: 'hash3',
      created_at,
    });
    expect(res2.outcome).toBe('already_exists');
  });

  test('DB-SUB-3: Boolean preference mapping works', async () => {
    const id = crypto.randomUUID();
    await repo.createIfNotExists({
      id,
      email: 'test3@example.com',
      normalized_email: 'test3@example.com',
      state: 'active',
      notify_70: false,
      notify_announced: true,
      management_token_hash: 'hash',
      created_at: new Date().toISOString(),
    });

    const sub = await repo.findById(id);
    expect(sub?.notify_70).toBe(false);
    expect(sub?.notify_announced).toBe(true);
  });

  test('DB-SUB-4: Invalid subscriber state rejected', async () => {
    // We bypass repo wrapper to inject raw bad data, testing DB constraints
    await expect(
      db
        .prepare(
          `
      INSERT INTO subscribers (id, email, normalized_email, state, management_token_hash, created_at, updated_at)
      VALUES (?, ?, ?, 'invalid_state', 'hash', '2026-07-18T00:00:00Z', '2026-07-18T00:00:00Z')
    `
        )
        .bind(crypto.randomUUID(), 'bad@example.com', 'bad@example.com')
        .run()
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  test('DB-SUB-5: Update preferences affects only probability70 and resetAnnounced', async () => {
    const id = crypto.randomUUID();
    await repo.createIfNotExists({
      id,
      email: 'test5@example.com',
      normalized_email: 'test5@example.com',
      state: 'active',
      notify_70: false,
      notify_announced: false,
      management_token_hash: 'hash',
      created_at: new Date().toISOString(),
    });

    await repo.updatePreferences(id, true, true, new Date().toISOString());
    const sub = await repo.findById(id);
    expect(sub?.notify_70).toBe(true);
    expect(sub?.notify_announced).toBe(true);
    expect(sub?.state).toBe('active'); // Ensure state is unchanged
  });

  test('REPO-CONFLICT-1: Intended unique conflict returns already_exists', async () => {
    // This is essentially DB-SUB-2, but explicitly named for the requirement.
    const created_at = new Date().toISOString();
    await repo.createIfNotExists({
      id: crypto.randomUUID(),
      email: 'conflict1@example.com',
      normalized_email: 'conflict1@example.com',
      state: 'active',
      notify_70: true,
      notify_announced: true,
      management_token_hash: 'h',
      created_at,
    });

    const res = await repo.createIfNotExists({
      id: crypto.randomUUID(),
      email: 'conflict1@example.com',
      normalized_email: 'conflict1@example.com',
      state: 'active',
      notify_70: true,
      notify_announced: true,
      management_token_hash: 'h2',
      created_at,
    });
    expect(res.outcome).toBe('already_exists');
  });

  test('REPO-CONFLICT-2: CHECK constraint violation is surfaced as an error', async () => {
    const res = await repo.createIfNotExists({
      id: crypto.randomUUID(),
      email: 'chk@example.com',
      normalized_email: 'chk@example.com',
      state: 'invalid_state_here' as unknown as 'active',
      notify_70: true,
      notify_announced: true,
      management_token_hash: 'h',
      created_at: new Date().toISOString(),
    });
    // Must be 'failed', not 'cooldown_suppressed'
    expect(res.outcome).toBe('failed');
  });

  test('REPO-CONFLICT-3: already_exists always returns the existing subscriber row', async () => {
    const created_at = new Date().toISOString();
    await repo.createIfNotExists({
      id: crypto.randomUUID(),
      email: 'conflict3@example.com',
      normalized_email: 'conflict3@example.com',
      state: 'active',
      notify_70: true,
      notify_announced: false,
      management_token_hash: 'h',
      created_at,
    });

    const res = await repo.createIfNotExists({
      id: crypto.randomUUID(),
      email: 'conflict3@example.com',
      normalized_email: 'conflict3@example.com',
      state: 'pending_confirmation',
      notify_70: false,
      notify_announced: false,
      management_token_hash: 'h2',
      created_at,
    });
    expect(res.outcome).toBe('already_exists');
    if (res.outcome === 'already_exists') {
      expect(res.subscriber).toBeDefined();
      expect(res.subscriber.state).toBe('active'); // Returns the ORIGINAL row
    }
  });

  test('REPO-CONFLICT-4: NOT NULL violation is surfaced as a typed failure', async () => {
    const res = await repo.createIfNotExists({
      id: crypto.randomUUID(),
      email: 'nn@example.com',
      normalized_email: null as unknown as string,
      state: 'active',
      notify_70: true,
      notify_announced: true,
      management_token_hash: 'h',
      created_at: new Date().toISOString(),
    });
    // Must be 'failed', not 'inconsistency' or 'cooldown_suppressed'
    expect(res.outcome).toBe('failed');
  });
});
