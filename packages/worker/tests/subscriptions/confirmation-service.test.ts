import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '../db/test-utils';
import { SubscriberRepository } from '../../src/db/repositories/SubscriberRepository';
import { SubscriptionTokenRepository } from '../../src/db/repositories/SubscriptionTokenRepository';
import { RateLimitRepository } from '../../src/db/repositories/RateLimitRepository';
import { DbTransactions } from '../../src/db/transactions';
import { RateLimitPolicy } from '../../src/subscriptions/rate-limit-policy';
import { ConfirmationService } from '../../src/services/confirmation-service';
import { SubscriptionService } from '../../src/services/subscription-service';
import { TokenService } from '../../src/subscriptions/token-service';
import { SubscriptionContext } from '../../src/subscriptions/subscription-types';
import { SubscriptionError } from '../../src/subscriptions/subscription-errors';

describe('ConfirmationService', () => {
  let db: D1Database;
  let subRepo: SubscriberRepository;
  let tokenRepo: SubscriptionTokenRepository;
  let transactions: DbTransactions;
  let ratePolicy: RateLimitPolicy;
  let confirmService: ConfirmationService;
  let subService: SubscriptionService;
  let ctx: SubscriptionContext;

  beforeEach(async () => {
    db = await setupTestDb();
    subRepo = new SubscriberRepository(db);
    tokenRepo = new SubscriptionTokenRepository(db);
    const rateRepo = new RateLimitRepository(db);
    transactions = new DbTransactions(db);
    ratePolicy = new RateLimitPolicy(rateRepo, 'secret');
    confirmService = new ConfirmationService(tokenRepo, subRepo, ratePolicy, transactions);
    subService = new SubscriptionService(subRepo, ratePolicy, transactions);

    ctx = { ipAddress: '127.0.0.1', hmacSecret: 'secret', now: new Date('2025-01-01T12:00:00Z') };
  });

  const generateAndInsertToken = async (
    subscriberId: string,
    overrides: Record<string, unknown>
  ) => {
    const raw = await TokenService.generate();
    await tokenRepo
      .getCreateStatement({
        id: `tok_${crypto.randomUUID()}`,
        subscriber_id: subscriberId,
        purpose: 'confirm_subscription',
        token_hash: raw.hashHex,
        requested_probability70: true,
        requested_reset_announced: false,
        created_at: ctx.now.toISOString(),
        expires_at: new Date(ctx.now.getTime() + 86400 * 1000).toISOString(),
        ...overrides,
      })
      .run();
    return raw.rawBase64Url;
  };

  it('SUB-CONF-1: confirms successfully and transitions to active', async () => {
    await subService.requestSubscription(
      'test@example.com',
      { probability70: true, resetAnnounced: false },
      ctx
    );
    const sub = await subRepo.findByNormalizedEmail('test@example.com');

    // We cannot easily get the raw token if generated internally by SubscriptionService,
    // so we'll generate and insert our own test token.
    const rawToken = await generateAndInsertToken(sub!.id, { purpose: 'confirm_subscription' });

    const outcome = await confirmService.confirm(rawToken, ctx);
    expect(outcome.managementToken.rawBase64Url).toBeDefined();

    const updated = await subRepo.findByNormalizedEmail('test@example.com');
    expect(updated!.state).toBe('active');
  });

  it('SUB-CONF-2: applies proposed preferences on confirmation', async () => {
    await subService
      .requestSubscription('test@example.com', { probability70: false, resetAnnounced: false }, ctx)
      .catch(() => {});

    // Insert a sub directly
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'pending_confirmation',
        notify_70: false,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: ctx.now.toISOString(),
      })
      .run();

    const rawToken = await generateAndInsertToken('sub1', {
      requested_probability70: false,
      requested_reset_announced: true,
    });

    await confirmService.confirm(rawToken, ctx);
    const updated = await subRepo.findById('sub1');
    expect(updated!.notify_70).toBe(false);
    expect(updated!.notify_announced).toBe(true);
  });

  it('SUB-CONF-3: invalidates the confirmation token (marks consumed)', async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'pending_confirmation',
        notify_70: false,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: ctx.now.toISOString(),
      })
      .run();
    const rawToken = await generateAndInsertToken('sub1', {});

    await confirmService.confirm(rawToken, ctx);

    const hash = await TokenService.hashToken(rawToken);
    const tokenRow = await tokenRepo.findByHash(hash);
    expect(tokenRow!.consumed_at).not.toBeNull();
  });

  it('SUB-CONF-4: throws EXPIRED_TOKEN for tokens past expires_at', async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'pending_confirmation',
        notify_70: false,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: ctx.now.toISOString(),
      })
      .run();
    const expiredTime = new Date(ctx.now.getTime() - 1000).toISOString();
    const rawToken = await generateAndInsertToken('sub1', { expires_at: expiredTime });

    await expect(confirmService.confirm(rawToken, ctx)).rejects.toThrowError(
      new SubscriptionError('EXPIRED_TOKEN', 'This token has expired.')
    );
  });

  it('SUB-CONF-5: throws INVALID_TOKEN for non-existent tokens', async () => {
    await expect(confirmService.confirm('invalid_token', ctx)).rejects.toThrowError(
      new SubscriptionError('INVALID_TOKEN', 'The provided token format is invalid.')
    );
  });

  it('SUB-CONF-6: throws INVALID_TOKEN if token is revoked', async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'pending_confirmation',
        notify_70: false,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: ctx.now.toISOString(),
      })
      .run();
    const rawToken = await generateAndInsertToken('sub1', { revoked_at: ctx.now.toISOString() });

    await expect(confirmService.confirm(rawToken, ctx)).rejects.toThrowError(
      new SubscriptionError('INVALID_TOKEN', 'This token has been revoked.')
    );
  });

  it('SUB-CONF-7: throws ALREADY_USED if already consumed and user is active', async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'active',
        notify_70: false,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: ctx.now.toISOString(),
      })
      .run();
    const rawToken = await generateAndInsertToken('sub1', { consumed_at: ctx.now.toISOString() });

    await expect(confirmService.confirm(rawToken, ctx)).rejects.toThrowError(
      new SubscriptionError('TOKEN_ALREADY_USED', 'This subscription is already confirmed.')
    );
  });

  it('SUB-CONF-8: handles IP rate limits for confirm attempts', async () => {
    for (let i = 0; i < 10; i++) {
      await confirmService.confirm('invalid-format', ctx).catch(() => {});
    }
    await expect(confirmService.confirm('invalid-format', ctx)).rejects.toThrowError(
      new SubscriptionError(
        'RATE_LIMITED',
        'Too many confirmation attempts. Please try again later.'
      )
    );
  });

  it('SUB-CONF-9: Generates a new management token upon confirmation', async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'pending_confirmation',
        notify_70: false,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: ctx.now.toISOString(),
      })
      .run();
    const rawToken = await generateAndInsertToken('sub1', {});

    const outcome = await confirmService.confirm(rawToken, ctx);
    const mgmtHash = await TokenService.hashToken(outcome.managementToken.rawBase64Url);

    const mgmtTokenRow = await tokenRepo.findByHash(mgmtHash);
    expect(mgmtTokenRow).toBeDefined();
    expect(mgmtTokenRow!.purpose).toBe('manage_subscription');
  });

  it('SUB-CONF-10: Audit event SUBSCRIPTION_CONFIRMED created', async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'pending_confirmation',
        notify_70: false,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: ctx.now.toISOString(),
      })
      .run();
    const rawToken = await generateAndInsertToken('sub1', {});

    await confirmService.confirm(rawToken, ctx);
    const audits = await db
      .prepare("SELECT * FROM audit_events WHERE type = 'SUBSCRIPTION_CONFIRMED'")
      .all();
    expect(audits.results.length).toBe(1);
  });
});
