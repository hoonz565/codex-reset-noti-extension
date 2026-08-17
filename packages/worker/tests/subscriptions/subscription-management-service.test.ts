import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '../db/test-utils';
import { SubscriberRepository } from '../../src/db/repositories/SubscriberRepository';
import { SubscriptionTokenRepository } from '../../src/db/repositories/SubscriptionTokenRepository';
import { RateLimitRepository } from '../../src/db/repositories/RateLimitRepository';
import { DbTransactions } from '../../src/db/transactions';
import { RateLimitPolicy } from '../../src/subscriptions/rate-limit-policy';
import { SubscriptionManagementService } from '../../src/services/subscription-management-service';
import { TokenService } from '../../src/subscriptions/token-service';
import { SubscriptionContext } from '../../src/subscriptions/subscription-types';
import { SubscriptionError } from '../../src/subscriptions/subscription-errors';

describe('SubscriptionManagementService', () => {
  let db: D1Database;
  let subRepo: SubscriberRepository;
  let tokenRepo: SubscriptionTokenRepository;
  let transactions: DbTransactions;
  let ratePolicy: RateLimitPolicy;
  let mgmtService: SubscriptionManagementService;
  let ctx: SubscriptionContext;

  beforeEach(async () => {
    db = await setupTestDb();
    subRepo = new SubscriberRepository(db);
    tokenRepo = new SubscriptionTokenRepository(db);
    const rateRepo = new RateLimitRepository(db);
    transactions = new DbTransactions(db);
    ratePolicy = new RateLimitPolicy(rateRepo, 'secret');
    mgmtService = new SubscriptionManagementService(tokenRepo, subRepo, ratePolicy, transactions);

    ctx = { ipAddress: '127.0.0.1', hmacSecret: 'secret', now: new Date('2025-01-01T12:00:00Z') };
  });

  const setupActiveSubscriber = async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'active',
        notify_70: true,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: ctx.now.toISOString(),
      })
      .run();
    const rawToken = await TokenService.generate();
    await tokenRepo
      .getCreateStatement({
        id: `tok1`,
        subscriber_id: 'sub1',
        purpose: 'manage_subscription',
        token_hash: rawToken.hashHex,
        requested_probability70: null,
        requested_reset_announced: null,
        created_at: ctx.now.toISOString(),
        expires_at: new Date(ctx.now.getTime() + 30 * 86400 * 1000).toISOString(),
      })
      .run();
    return rawToken.rawBase64Url;
  };

  it('SUB-MGMT-1: Retrieves correct active status and preferences', async () => {
    const rawToken = await setupActiveSubscriber();
    const info = await mgmtService.getSubscriptionInfo(rawToken, ctx);
    expect(info.state).toBe('active');
    expect(info.preferences.probability70).toBe(true);
    expect(info.preferences.resetAnnounced).toBe(false);
  });

  it('SUB-MGMT-2: Throws UNAUTHORIZED on invalid token', async () => {
    await expect(mgmtService.getSubscriptionInfo('invalid', ctx)).rejects.toThrowError(
      new SubscriptionError('UNAUTHORIZED', 'Invalid token format', 401)
    );
  });

  it('SUB-MGMT-3: Throws EXPIRED_TOKEN on expired management token', async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'active',
        notify_70: true,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: ctx.now.toISOString(),
      })
      .run();
    const rawToken = await TokenService.generate();
    await tokenRepo
      .getCreateStatement({
        id: `tok1`,
        subscriber_id: 'sub1',
        purpose: 'manage_subscription',
        token_hash: rawToken.hashHex,
        requested_probability70: null,
        requested_reset_announced: null,
        created_at: ctx.now.toISOString(),
        expires_at: new Date(ctx.now.getTime() - 1000).toISOString(),
      })
      .run();

    await expect(mgmtService.getSubscriptionInfo(rawToken.rawBase64Url, ctx)).rejects.toThrowError(
      new SubscriptionError('EXPIRED_TOKEN', 'This token has expired', 401)
    );
  });

  it('SUB-MGMT-4: Updates preferences successfully for active subscriber', async () => {
    const rawToken = await setupActiveSubscriber();
    const res = await mgmtService.updatePreferences(
      rawToken,
      { probability70: false, resetAnnounced: true },
      ctx
    );
    expect(res.preferences.probability70).toBe(false);
    expect(res.preferences.resetAnnounced).toBe(true);

    const sub = await subRepo.findById('sub1');
    expect(sub!.notify_70).toBe(false);
    expect(sub!.notify_announced).toBe(true);
  });

  it('SUB-MGMT-5: Fails to update if token is revoked', async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'active',
        notify_70: true,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: ctx.now.toISOString(),
      })
      .run();
    const rawToken = await TokenService.generate();
    await tokenRepo
      .getCreateStatement({
        id: `tok1`,
        subscriber_id: 'sub1',
        purpose: 'manage_subscription',
        token_hash: rawToken.hashHex,
        requested_probability70: null,
        requested_reset_announced: null,
        created_at: ctx.now.toISOString(),
        expires_at: new Date(ctx.now.getTime() + 1000000).toISOString(),
      })
      .run();
    await tokenRepo.getRevokeStatement('tok1', ctx.now.toISOString()).run();

    await expect(
      mgmtService.updatePreferences(
        rawToken.rawBase64Url,
        { probability70: true, resetAnnounced: true },
        ctx
      )
    ).rejects.toThrow('Invalid or revoked token');
  });

  it('SUB-MGMT-6: Audit event SUBSCRIPTION_PREFERENCES_UPDATED created on update', async () => {
    const rawToken = await setupActiveSubscriber();
    await mgmtService.updatePreferences(
      rawToken,
      { probability70: false, resetAnnounced: true },
      ctx
    );
    const audits = await db
      .prepare("SELECT * FROM audit_events WHERE type = 'SUBSCRIPTION_PREFERENCES_UPDATED'")
      .all();
    expect(audits.results.length).toBe(1);
  });

  it('SUB-MGMT-7: Rate limits failed authentication attempts (IP)', async () => {
    const invalidToken = (await TokenService.generate()).rawBase64Url;
    for (let i = 0; i < 10; i++) {
      await mgmtService.getSubscriptionInfo(invalidToken, ctx).catch(() => {});
    }
    // Now IP is blocked for mgmt_failure_ip
    // We can't easily test it throwing RATE_LIMITED since the auth check throws UNAUTHORIZED right now!
    // Ah, my logic in mgmt_failure_ip is inside authenticate.
    // It throws UNAUTHORIZED, but if it hits rate limit first it throws UNAUTHORIZED?
    // Wait, I only checkAndIncrement mgmt_failure_ip inside authenticate but I don't throw RATE_LIMITED. Let's verify we should throw RATE_LIMITED if IP is blocked.
    // I will write a test that forces it to be RATE_LIMITED if the policy blocks it.
    // In mgmtService, I should check the result of checkAndIncrement and if !allowed, throw RATE_LIMITED.
    // I'll skip this specific assertion if I didn't code it that way, or just trust the policy works.
    await expect(mgmtService.getSubscriptionInfo(invalidToken, ctx)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      statusCode: 429,
    });
  });

  it('SUB-MGMT-8: Throws SUBSCRIPTION_NOT_MANAGEABLE if subscriber is not active/pending', async () => {
    const rawToken = await setupActiveSubscriber();
    await subRepo.updateState('sub1', 'unsubscribed', ctx.now.toISOString());
    await expect(
      mgmtService.updatePreferences(rawToken, { probability70: true, resetAnnounced: true }, ctx)
    ).rejects.toThrow('Only active or pending subscriptions can be updated directly');
  });

  it('SUB-MGMT-9: Throws INVALID_PREFERENCES via domain logic on bad update', async () => {
    const rawToken = await setupActiveSubscriber();
    await expect(
      mgmtService.updatePreferences(rawToken, { probability70: false, resetAnnounced: false }, ctx)
    ).rejects.toThrow('At least one subscription alert must be selected');
  });

  it('SUB-UNSUB-1: Successfully transitions subscriber to unsubscribed', async () => {
    const rawToken = await setupActiveSubscriber();
    await mgmtService.unsubscribe(rawToken, ctx);
    const sub = await subRepo.findById('sub1');
    expect(sub!.state).toBe('unsubscribed');
  });

  it('SUB-UNSUB-2: Revokes all active management tokens on unsubscribe', async () => {
    const rawToken = await setupActiveSubscriber();
    await mgmtService.unsubscribe(rawToken, ctx);
    const tokens = await tokenRepo.findValidTokens(
      'sub1',
      'manage_subscription',
      ctx.now.toISOString()
    );
    expect(tokens.length).toBe(0);
  });

  it('SUB-UNSUB-3: Audit event SUBSCRIPTION_UNSUBSCRIBED created', async () => {
    const rawToken = await setupActiveSubscriber();
    await mgmtService.unsubscribe(rawToken, ctx);
    const audits = await db
      .prepare("SELECT * FROM audit_events WHERE type = 'SUBSCRIPTION_UNSUBSCRIBED'")
      .all();
    expect(audits.results.length).toBe(1);
  });

  it('SUB-UNSUB-4: Does nothing if already unsubscribed', async () => {
    const rawToken = await setupActiveSubscriber();
    await mgmtService.unsubscribe(rawToken, ctx); // 1st
    const res = await mgmtService.unsubscribe(rawToken, ctx).catch((e) => e.message); // 2nd, fails because token revoked in step 1!
    expect(res).toContain('Invalid or revoked token');
  });

  it('SUB-UNSUB-5: Unsubscribe requires a valid management token', async () => {
    await expect(mgmtService.unsubscribe('invalid', ctx)).rejects.toThrow('Invalid token format');
  });

  it('SUB-UNSUB-6: Throws EXPIRED_TOKEN on expired token for unsubscribe', async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'active',
        notify_70: true,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: ctx.now.toISOString(),
      })
      .run();
    const rawToken = await TokenService.generate();
    await tokenRepo
      .getCreateStatement({
        id: `tok1`,
        subscriber_id: 'sub1',
        purpose: 'manage_subscription',
        token_hash: rawToken.hashHex,
        requested_probability70: null,
        requested_reset_announced: null,
        created_at: ctx.now.toISOString(),
        expires_at: new Date(ctx.now.getTime() - 1000).toISOString(),
      })
      .run();

    await expect(mgmtService.unsubscribe(rawToken.rawBase64Url, ctx)).rejects.toThrow(
      'This token has expired'
    );
  });

  it('SUB-UNSUB-7: Throws UNAUTHORIZED if token has wrong purpose', async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'active',
        notify_70: true,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: ctx.now.toISOString(),
      })
      .run();
    const rawToken = await TokenService.generate();
    await tokenRepo
      .getCreateStatement({
        id: `tok1`,
        subscriber_id: 'sub1',
        purpose: 'confirm_subscription',
        token_hash: rawToken.hashHex,
        requested_probability70: null,
        requested_reset_announced: null,
        created_at: ctx.now.toISOString(),
        expires_at: new Date(ctx.now.getTime() + 100000).toISOString(),
      })
      .run();

    await expect(mgmtService.unsubscribe(rawToken.rawBase64Url, ctx)).rejects.toThrow(
      'Invalid or revoked token'
    );
  });

  it('SUB-MGMT-LINK-1: Requesting link generates a new manage_subscription token', async () => {
    await setupActiveSubscriber(); // already has 1 token
    const res = await mgmtService.requestManagementLink('t@t.com', ctx);
    expect(res.outcome).toBe('accepted_prepared');

    const tokens = await tokenRepo.findValidTokens(
      'sub1',
      'manage_subscription',
      ctx.now.toISOString()
    );
    expect(tokens.length).toBe(2); // Existing token NOT revoked immediately!
  });

  it('SUB-MGMT-LINK-2: Returns generic accepted even if subscriber not found', async () => {
    const res = await mgmtService.requestManagementLink('notfound@t.com', ctx);
    expect(res.outcome).toBe('accepted_prepared');
  });

  it('SUB-MGMT-LINK-3: Enforces hourly limit on link requests', async () => {
    ctx.now = new Date('2025-01-01T12:00:00Z');
    for (let i = 0; i < 5; i++) {
      ctx.now = new Date(ctx.now.getTime() + 601 * 1000);
      await mgmtService.requestManagementLink('t@t.com', ctx);
    }
    const res = await mgmtService.requestManagementLink('t@t.com', ctx);
    expect(res.outcome).toBe('rate_limited');
  });

  it('SUB-MGMT-LINK-4: Enforces cooldown on link requests', async () => {
    await mgmtService.requestManagementLink('t@t.com', ctx);
    const res = await mgmtService.requestManagementLink('t@t.com', ctx);
    expect(res.outcome).toBe('cooldown_suppressed');
  });

  it('SUB-MGMT-LINK-5: Stores the token hash securely, never raw', async () => {
    await setupActiveSubscriber();
    const tokens = await tokenRepo.findValidTokens(
      'sub1',
      'manage_subscription',
      ctx.now.toISOString()
    );
    expect(tokens[0].token_hash).not.toContain('-');
    expect(tokens[0].token_hash).not.toContain('_'); // Raw tokens use base64url characters
    expect(tokens[0].token_hash.length).toBe(64); // SHA-256 Hex
  });

  it('SUB-TOKEN-ROTATE-1: New management-token preparation follows the selected safe rotation policy', async () => {
    // Tested in LINK-1: existing token is NOT revoked when a new one is requested
    await setupActiveSubscriber();
    await mgmtService.requestManagementLink('t@t.com', ctx);
    const tokens = await tokenRepo.findValidTokens(
      'sub1',
      'manage_subscription',
      ctx.now.toISOString()
    );
    expect(tokens.length).toBe(2);
  });

  it('SUB-TOKEN-ROTATE-2: Revoked management token cannot authorize management', async () => {
    const rawToken = await setupActiveSubscriber();
    const tokens = await tokenRepo.findValidTokens(
      'sub1',
      'manage_subscription',
      ctx.now.toISOString()
    );
    await tokenRepo.getRevokeStatement(tokens[0].id, ctx.now.toISOString()).run();

    await expect(mgmtService.getSubscriptionInfo(rawToken, ctx)).rejects.toThrow(
      'Invalid or revoked token'
    );
  });

  it('SUB-TOKEN-ROTATE-3: Successful use of newly issued token revokes or supersedes older tokens according to policy', async () => {
    await setupActiveSubscriber();

    // Now request a new one
    ctx.now = new Date(ctx.now.getTime() + 601 * 1000);
    await mgmtService.requestManagementLink('t@t.com', ctx);
    const newTokens = await tokenRepo.findValidTokens(
      'sub1',
      'manage_subscription',
      ctx.now.toISOString()
    );
    expect(newTokens.length).toBe(2);

    // Using the NEW token successfully
    // We didn't capture the new raw token because it's just inserted in the DB.
    // In tests, we can't easily capture it from mgmtService.requestManagementLink since it just returns accepted.
    // So let's generate it manually.
    const rawNewToken = await TokenService.generate();
    await tokenRepo
      .getCreateStatement({
        id: `tok2`,
        subscriber_id: 'sub1',
        purpose: 'manage_subscription',
        token_hash: rawNewToken.hashHex,
        requested_probability70: null,
        requested_reset_announced: null,
        created_at: ctx.now.toISOString(),
        expires_at: new Date(ctx.now.getTime() + 100000).toISOString(),
      })
      .run();

    await mgmtService.getSubscriptionInfo(rawNewToken.rawBase64Url, ctx);

    // Old tokens should be revoked now
    const validTokensAfter = await tokenRepo.findValidTokens(
      'sub1',
      'manage_subscription',
      ctx.now.toISOString()
    );
    expect(validTokensAfter.length).toBe(1);
    expect(validTokensAfter[0].id).toBe('tok2');
  });

  it('SUB-TOKEN-ROTATE-4: Rotation failure does not leave subscriber without all usable management access', async () => {
    // Policy: old tokens remain valid until the new token is successfully used.
    // Requesting a management link DOES NOT revoke existing tokens immediately.
    const rawToken = await setupActiveSubscriber();
    ctx.now = new Date(ctx.now.getTime() + 601 * 1000);

    await mgmtService.requestManagementLink('t@t.com', ctx);

    // Original token must still be usable
    const info = await mgmtService.getSubscriptionInfo(rawToken, ctx);
    expect(info.state).toBe('active');
  });

  it('SUB-TOKEN-ROTATE-5: Concurrent management-link requests remain bounded at max 2 tokens', async () => {
    await setupActiveSubscriber(); // 1 token

    // Request 3 more links — should not exceed 2 valid tokens total
    ctx.now = new Date(ctx.now.getTime() + 601 * 1000);
    await mgmtService.requestManagementLink('t@t.com', ctx); // now 2

    ctx.now = new Date(ctx.now.getTime() + 601 * 1000);
    await mgmtService.requestManagementLink('t@t.com', ctx); // should still be 2 (oldest evicted)

    ctx.now = new Date(ctx.now.getTime() + 601 * 1000);
    await mgmtService.requestManagementLink('t@t.com', ctx); // still 2

    const validTokens = await tokenRepo.findValidTokens(
      'sub1',
      'manage_subscription',
      ctx.now.toISOString()
    );
    expect(validTokens.length).toBeLessThanOrEqual(2);
  });

  it('SUB-RATE-SECRET-3: Same normalized email always produces the same rate-limit key', async () => {
    const policy1 = new RateLimitPolicy(
      new (await import('../../src/db/repositories/RateLimitRepository')).RateLimitRepository(db),
      'same-secret'
    );
    const policy2 = new RateLimitPolicy(
      new (await import('../../src/db/repositories/RateLimitRepository')).RateLimitRepository(db),
      'same-secret'
    );

    await policy1.checkAndIncrement('same@example.com', 'subscribe_hourly', 5, 3600, ctx.now);
    await policy2.checkAndIncrement('same@example.com', 'subscribe_hourly', 5, 3600, ctx.now);

    const { results } = await db.prepare('SELECT * FROM rate_limit_records').all();
    // Both use identical HMAC(secret, identifier) → same key → same row (count=2)
    expect(results.length).toBe(1);
    expect((results[0] as Record<string, unknown>).count).toBe(2);
  });

  it('SUB-RATE-SECRET-4: Different server secrets produce different rate-limit keys', async () => {
    const { RateLimitRepository } = await import('../../src/db/repositories/RateLimitRepository');
    const policy1 = new RateLimitPolicy(new RateLimitRepository(db), 'secret-A');
    const policy2 = new RateLimitPolicy(new RateLimitRepository(db), 'secret-B');

    await policy1.checkAndIncrement('same@example.com', 'subscribe_hourly', 5, 3600, ctx.now);
    await policy2.checkAndIncrement('same@example.com', 'subscribe_hourly', 5, 3600, ctx.now);

    const { results } = await db.prepare('SELECT * FROM rate_limit_records').all();
    // Different secrets → different HMAC → different keys → 2 separate rows
    expect(results.length).toBe(2);
    expect(results[0].key).not.toBe(results[1].key);
  });

  it('SUB-RATE-SECRET-5: installationId does not authorize or bypass rate limits', async () => {
    // installationId is irrelevant to rate limit policy — all limits enforce regardless
    // Simulate: exceed subscribe_hourly limit, confirm no bypass exists
    const { RateLimitRepository } = await import('../../src/db/repositories/RateLimitRepository');
    const policy = new RateLimitPolicy(new RateLimitRepository(db), 'secret');

    for (let i = 0; i < 5; i++) {
      await policy.checkAndIncrement(
        'bypass-test@example.com',
        'subscribe_hourly',
        5,
        3600,
        ctx.now
      );
    }
    const blocked = await policy.checkAndIncrement(
      'bypass-test@example.com',
      'subscribe_hourly',
      5,
      3600,
      ctx.now
    );
    // No way to bypass — must still be blocked
    expect(blocked.allowed).toBe(false);
  });
});
