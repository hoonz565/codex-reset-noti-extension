import { SubscriptionPreferences } from '@codex-reset/shared';
import { SubscriberRepository } from '../db/repositories/SubscriberRepository';
import { RateLimitPolicy } from '../subscriptions/rate-limit-policy';
import { DbTransactions } from '../db/transactions';
import { EmailNormalizer } from '../subscriptions/email-normalizer';
import { SubscriptionValidator } from '../subscriptions/subscription-validator';
import { TokenService } from '../subscriptions/token-service';
import { SubscriptionContext } from '../subscriptions/subscription-types';
import { SubscriptionError } from '../subscriptions/subscription-errors';

export type SubscriptionRequestResult =
  | { outcome: 'confirmation_prepared'; subscriberId: string; rawConfirmationToken: string }
  | { outcome: 'resubscription_pending'; subscriberId: string; rawConfirmationToken: string }
  | { outcome: 'cooldown_suppressed'; retryAfterSeconds: number }
  | { outcome: 'rate_limited' }
  | { outcome: 'failed'; error: SubscriptionError };

export class SubscriptionService {
  constructor(
    private subscriberRepo: SubscriberRepository,
    private rateLimitPolicy: RateLimitPolicy,
    private transactions: DbTransactions
  ) {}

  async requestSubscription(
    rawEmail: string,
    preferences: SubscriptionPreferences,
    ctx: SubscriptionContext
  ): Promise<SubscriptionRequestResult> {
    try {
      // 1. Validation & Normalization
      const validPrefs = SubscriptionValidator.validatePreferences(preferences);
      const normalizedEmail = EmailNormalizer.normalize(rawEmail);

      // 2. Rate Limiting (IP limit first to prevent brute force, then email limit)
      const ipResult = await this.rateLimitPolicy.checkAndIncrement(
        ctx.ipAddress,
        'subscribe_ip_hourly',
        20,
        3600,
        ctx.now
      );
      if (!ipResult.allowed) return { outcome: 'rate_limited' };

      const emailHourly = await this.rateLimitPolicy.checkAndIncrement(
        normalizedEmail,
        'subscribe_hourly',
        5,
        3600,
        ctx.now
      );
      if (!emailHourly.allowed) return { outcome: 'rate_limited' };

      const emailCooldown = await this.rateLimitPolicy.checkAndIncrement(
        normalizedEmail,
        'subscribe_cooldown',
        1,
        300,
        ctx.now
      );
      if (!emailCooldown.allowed) {
        // No token or lifecycle audit during suppression.
        // Policy: no SUBSCRIPTION_RATE_LIMITED audit is created here (rate limited = no write).
        return {
          outcome: 'cooldown_suppressed',
          retryAfterSeconds: emailCooldown.retryAfterSeconds ?? 300,
        };
      }

      // 3. Attempt Insert
      const newSubscriberId = `sub_${crypto.randomUUID()}`;
      const insertRes = await this.subscriberRepo.createIfNotExists({
        id: newSubscriberId,
        email: rawEmail,
        normalized_email: normalizedEmail,
        state: 'pending_confirmation',
        notify_70: false, // Explicitly false until confirmed
        notify_announced: false, // Explicitly false until confirmed
        management_token_hash: 'pending', // Replaced upon confirmation
        created_at: ctx.now.toISOString(),
      });

      if (insertRes.outcome === 'failed') {
        return {
          outcome: 'failed',
          error: new SubscriptionError('INTERNAL_ERROR', 'Database failure', 500),
        };
      }

      if (insertRes.outcome === 'inconsistency') {
        return {
          outcome: 'failed',
          error: new SubscriptionError('INTERNAL_ERROR', 'Database inconsistency', 500),
        };
      }

      const existing = insertRes.outcome === 'already_exists' ? insertRes.subscriber : null;
      const subscriberId = existing ? existing.id : newSubscriberId;

      // 4. Token Generation (24 hours for confirmation)
      const token = await TokenService.generate();
      const expiresAt = new Date(ctx.now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const tokenParams = {
        id: `tok_${crypto.randomUUID()}`,
        subscriber_id: subscriberId,
        purpose: 'confirm_subscription' as const,
        token_hash: token.hashHex,
        requested_probability70: validPrefs.probability70,
        requested_reset_announced: validPrefs.resetAnnounced,
        created_at: ctx.now.toISOString(),
        expires_at: expiresAt,
      };

      const auditParams = {
        id: `aud_${crypto.randomUUID()}`,
        type: 'SUBSCRIPTION_REQUESTED',
        deduplication_key: `req_${subscriberId}_${ctx.now.getTime()}`,
        subject_type: 'subscriber',
        subject_id: subscriberId,
        payload: {},
        created_at: ctx.now.toISOString(),
      };

      // 5. Database Transactions
      if (!existing) {
        await this.transactions.createPendingSubscriptionTokens(
          subscriberId,
          tokenParams,
          auditParams
        );
        return {
          outcome: 'confirmation_prepared',
          subscriberId,
          rawConfirmationToken: token.rawBase64Url,
        };
      } else {
        await this.transactions.prepareResubscription(
          subscriberId,
          tokenParams,
          auditParams,
          ctx.now.toISOString(),
          existing.state === 'unsubscribed',
          existing.token_version
        );
        return {
          outcome: 'resubscription_pending',
          subscriberId,
          rawConfirmationToken: token.rawBase64Url,
        };
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'CONCURRENCY_CONFLICT') {
        return {
          outcome: 'failed',
          error: new SubscriptionError('CONFLICT', 'Concurrent request conflict', 409),
        };
      }
      return {
        outcome: 'failed',
        error: new SubscriptionError('INTERNAL_ERROR', 'Unexpected error', 500),
      };
    }
  }
}
