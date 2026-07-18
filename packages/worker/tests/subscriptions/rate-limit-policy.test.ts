import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '../db/test-utils';
import { RateLimitRepository } from '../../src/db/repositories/RateLimitRepository';
import { RateLimitPolicy } from '../../src/subscriptions/rate-limit-policy';

describe('RateLimitPolicy', () => {
  let db: D1Database;
  let repo: RateLimitRepository;
  let policy: RateLimitPolicy;
  const hmacSecret = 'test-secret';

  beforeEach(async () => {
    db = await setupTestDb();
    repo = new RateLimitRepository(db);
    policy = new RateLimitPolicy(repo, hmacSecret);
  });

  it('SUB-RATE-1: allows requests under the limit', async () => {
    const now = new Date();
    const res = await policy.checkAndIncrement(
      'test@example.com',
      'subscribe_hourly',
      5,
      3600,
      now
    );
    expect(res.allowed).toBe(true);
  });

  it('SUB-RATE-2: blocks requests over the limit and returns retryAfter', async () => {
    const now = new Date();
    await policy.checkAndIncrement('test@example.com', 'subscribe_hourly', 2, 3600, now);
    await policy.checkAndIncrement('test@example.com', 'subscribe_hourly', 2, 3600, now);

    const blocked = await policy.checkAndIncrement(
      'test@example.com',
      'subscribe_hourly',
      2,
      3600,
      now
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(3600);
  });

  it('SUB-RATE-3: allows requests after window expires', async () => {
    const now = new Date();
    await policy.checkAndIncrement('test@example.com', 'subscribe_hourly', 1, 3600, now);

    // Blocked if same time
    const blocked = await policy.checkAndIncrement(
      'test@example.com',
      'subscribe_hourly',
      1,
      3600,
      now
    );
    expect(blocked.allowed).toBe(false);

    // Allowed if future time
    const future = new Date(now.getTime() + 3601 * 1000);
    const allowed = await policy.checkAndIncrement(
      'test@example.com',
      'subscribe_hourly',
      1,
      3600,
      future
    );
    expect(allowed.allowed).toBe(true);
  });

  it('SUB-RATE-4: limits apply per action separately', async () => {
    const now = new Date();
    await policy.checkAndIncrement('test@example.com', 'subscribe_hourly', 1, 3600, now);

    const subscribeBlocked = await policy.checkAndIncrement(
      'test@example.com',
      'subscribe_hourly',
      1,
      3600,
      now
    );
    expect(subscribeBlocked.allowed).toBe(false);

    const otherActionAllowed = await policy.checkAndIncrement(
      'test@example.com',
      'mgmt_link_hourly',
      1,
      3600,
      now
    );
    expect(otherActionAllowed.allowed).toBe(true);
  });

  it('SUB-RATE-5: limits apply per identifier separately', async () => {
    const now = new Date();
    await policy.checkAndIncrement('test1@example.com', 'subscribe_hourly', 1, 3600, now);

    const otherUserAllowed = await policy.checkAndIncrement(
      'test2@example.com',
      'subscribe_hourly',
      1,
      3600,
      now
    );
    expect(otherUserAllowed.allowed).toBe(true);
  });

  it('SUB-RATE-6: enforces IP limits independently of email', async () => {
    const now = new Date();
    await policy.checkAndIncrement('127.0.0.1', 'subscribe_ip_hourly', 1, 3600, now);

    const ipBlocked = await policy.checkAndIncrement(
      '127.0.0.1',
      'subscribe_ip_hourly',
      1,
      3600,
      now
    );
    expect(ipBlocked.allowed).toBe(false);

    const diffIpAllowed = await policy.checkAndIncrement(
      '127.0.0.2',
      'subscribe_ip_hourly',
      1,
      3600,
      now
    );
    expect(diffIpAllowed.allowed).toBe(true);
  });

  it('SUB-RATE-7: enforces cooldown window explicitly', async () => {
    const now = new Date();
    await policy.checkAndIncrement('test@example.com', 'subscribe_cooldown', 1, 300, now);

    const blocked = await policy.checkAndIncrement(
      'test@example.com',
      'subscribe_cooldown',
      1,
      300,
      now
    );
    expect(blocked.allowed).toBe(false);
  });

  it('SUB-RATE-8: returns accurate retryAfter based on exact window', async () => {
    const now = new Date('2025-01-01T12:00:00.000Z');
    await policy.checkAndIncrement('test@example.com', 'subscribe_cooldown', 1, 300, now);

    const later = new Date('2025-01-01T12:02:00.000Z'); // 120 seconds later
    const blocked = await policy.checkAndIncrement(
      'test@example.com',
      'subscribe_cooldown',
      1,
      300,
      later
    );

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(180); // 300 - 120 = 180 seconds left
  });

  it('SUB-RATE-SECRET-1: Rate-limit records do not contain raw normalized emails', async () => {
    const email = 'secret@example.com';
    const now = new Date();
    await policy.checkAndIncrement(email, 'subscribe_hourly', 1, 3600, now);

    const stmt = db.prepare('SELECT * FROM rate_limit_records LIMIT 10');
    const { results } = await stmt.all();

    expect(results.length).toBe(1);
    expect(results[0].key).not.toContain(email);
    expect(results[0].key).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex is 64 chars
  });

  it('SUB-RATE-SECRET-2: Rate-limit records do not contain raw IP addresses', async () => {
    const ip = '192.168.1.100';
    const now = new Date();
    await policy.checkAndIncrement(ip, 'subscribe_ip_hourly', 1, 3600, now);

    const stmt = db.prepare('SELECT * FROM rate_limit_records LIMIT 10');
    const { results } = await stmt.all();

    expect(results.length).toBe(1);
    expect(results[0].key).not.toContain(ip);
    expect(results[0].key).toMatch(/^[a-f0-9]{64}$/);
  });
});
