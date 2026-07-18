import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestDb } from './test-utils';
import { AuditEventRepository } from '../../src/db';
import * as crypto from 'crypto';

describe('Audit Event Repository', () => {
  let db: D1Database;
  let repo: AuditEventRepository;

  beforeAll(async () => {
    db = await setupTestDb();
    repo = new AuditEventRepository(db);
  });

  test('DB-AUDIT-1: Create ordinary audit event with NULL deduplication key', async () => {
    const id = crypto.randomUUID();
    await repo.create({
      id,
      type: 'SOURCE_DEGRADED',
      deduplication_key: null,
      subject_type: 'source',
      subject_id: 'codex',
      payload: { health: 'degraded' },
      created_at: new Date().toISOString(),
    });

    const recent = await repo.listRecent(10);
    const event = recent.find((r) => r.id === id);
    expect(event).toBeDefined();
    expect(event?.payload).toEqual({ health: 'degraded' });
  });

  test('DB-AUDIT-2: Multiple NULL deduplication keys are allowed', async () => {
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();

    await repo.create({
      id: id1,
      type: 'PARSER_FAILURE',
      deduplication_key: null,
      subject_type: null,
      subject_id: null,
      payload: null,
      created_at: new Date().toISOString(),
    });

    await repo.create({
      id: id2,
      type: 'PARSER_FAILURE',
      deduplication_key: null,
      subject_type: null,
      subject_id: null,
      payload: null,
      created_at: new Date().toISOString(),
    });

    const recent = await repo.listRecent(10);
    expect(recent.some((r) => r.id === id1)).toBe(true);
    expect(recent.some((r) => r.id === id2)).toBe(true);
  });

  test('DB-AUDIT-3: Deterministic duplicate deduplication key creates one row', async () => {
    const dedupKey = 'dedup_test_1';

    const { result: res1 } = await repo.createIfAbsentByDeduplicationKey({
      id: crypto.randomUUID(),
      type: 'CYCLE_CREATED',
      deduplication_key: dedupKey,
      subject_type: 'cycle',
      subject_id: 'cycle:123',
      payload: null,
      created_at: new Date().toISOString(),
    });
    expect(res1).toBe('inserted');

    const { result: res2 } = await repo.createIfAbsentByDeduplicationKey({
      id: crypto.randomUUID(),
      type: 'CYCLE_CREATED',
      deduplication_key: dedupKey, // same key
      subject_type: 'cycle',
      subject_id: 'cycle:123',
      payload: null,
      created_at: new Date().toISOString(),
    });
    expect(res2).toBe('already_exists');
  });

  test('DB-AUDIT-4: Operational RESET_COMPLETED audit event accepted', async () => {
    const id = crypto.randomUUID();
    await repo.create({
      id,
      type: 'RESET_COMPLETED',
      deduplication_key: null,
      subject_type: 'cycle',
      subject_id: 'cycle:old',
      payload: null,
      created_at: new Date().toISOString(),
    });

    const recent = await repo.listRecent(10);
    const event = recent.find((r) => r.id === id);
    expect(event).toBeDefined();
    expect(event?.type).toBe('RESET_COMPLETED');
  });
});
