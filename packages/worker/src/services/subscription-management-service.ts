import { SubscriptionPreferences } from '@codex-reset/shared';
import { SubscriptionTokenRepository } from '../db/repositories/SubscriptionTokenRepository';
import { SubscriberRepository } from '../db/repositories/SubscriberRepository';
import { RateLimitPolicy } from '../subscriptions/rate-limit-policy';
import { DbTransactions } from '../db/transactions';
import { TokenService } from '../subscriptions/token-service';
import { SubscriptionContext } from '../subscriptions/subscription-types';
import { SubscriptionError } from '../subscriptions/subscription-errors';
import { EmailNormalizer } from '../subscriptions/email-normalizer';
import { SubscriptionValidator } from '../subscriptions/subscription-validator';

export class SubscriptionManagementService {
  constructor(
    private tokenRepo: SubscriptionTokenRepository,
    private subscriberRepo: SubscriberRepository,
    private rateLimitPolicy: RateLimitPolicy,
    private transactions: DbTransactions
  ) {}

  async requestManagementLink(
    rawEmail: string,
    ctx: SubscriptionContext
  ): Promise<
    | {
        outcome: 'accepted_prepared';
        delivery?: { recipient: string; rawManagementToken: string };
      }
    | { outcome: 'cooldown_suppressed' | 'rate_limited' }
  > {
    const normalizedEmail = EmailNormalizer.normalize(rawEmail);

    const hourly = await this.rateLimitPolicy.checkAndIncrement(
      normalizedEmail,
      'mgmt_link_hourly',
      5,
      3600,
      ctx.now
    );
    if (!hourly.allowed) return { outcome: 'rate_limited' };

    const cooldown = await this.rateLimitPolicy.checkAndIncrement(
      normalizedEmail,
      'mgmt_link_cooldown',
      1,
      600,
      ctx.now
    );
    if (!cooldown.allowed) return { outcome: 'cooldown_suppressed' };

    const subscriber = await this.subscriberRepo.findByNormalizedEmail(normalizedEmail);
    if (!subscriber) {
      // Return accepted to prevent enumeration
      return { outcome: 'accepted_prepared' };
    }

    // Generate new management token (do not revoke old ones yet)
    const mgmtToken = await TokenService.generate();
    const expiresAt = new Date(ctx.now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const tokenParams = {
      id: `tok_${crypto.randomUUID()}`,
      subscriber_id: subscriber.id,
      purpose: 'manage_subscription' as const,
      token_hash: mgmtToken.hashHex,
      requested_probability70: null,
      requested_reset_announced: null,
      created_at: ctx.now.toISOString(),
      expires_at: expiresAt,
    };

    // Bounding management tokens to max 2
    const activeTokens = await this.tokenRepo.findValidTokens(
      subscriber.id,
      'manage_subscription',
      ctx.now.toISOString()
    );
    const tokensToRevoke: string[] = [];
    if (activeTokens.length >= 2) {
      // If we have N tokens, we want to keep at most 1 (so after adding new one, we have 2).
      // Since they are ordered by created_at ASC, the first ones are the oldest.
      const numberToRevoke = activeTokens.length - 1;
      for (let i = 0; i < numberToRevoke; i++) {
        tokensToRevoke.push(activeTokens[i].id);
      }
    }

    const auditParams = {
      id: `aud_${crypto.randomUUID()}`,
      type: 'SUBSCRIPTION_MANAGEMENT_LINK_REQUESTED',
      deduplication_key: `req_mgmt_${subscriber.id}_${ctx.now.getTime()}`,
      subject_type: 'subscriber',
      subject_id: subscriber.id,
      payload: {},
      created_at: ctx.now.toISOString(),
    };

    await this.transactions.issueManagementToken(
      tokenParams,
      tokensToRevoke,
      auditParams,
      ctx.now.toISOString()
    );

    return {
      outcome: 'accepted_prepared',
      delivery: {
        recipient: subscriber.email,
        rawManagementToken: mgmtToken.rawBase64Url,
      },
    };
  }

  private async authenticate(rawToken: string, ctx: SubscriptionContext) {
    let tokenHash: string;
    try {
      tokenHash = await TokenService.hashToken(rawToken);
    } catch {
      throw new SubscriptionError('UNAUTHORIZED', 'Invalid token format', 401);
    }

    const tokenRow = await this.tokenRepo.findByHash(tokenHash);
    if (!tokenRow || tokenRow.purpose !== 'manage_subscription' || tokenRow.revoked_at) {
      const limit = await this.rateLimitPolicy.checkAndIncrement(
        ctx.ipAddress,
        'mgmt_failure_ip',
        10,
        900,
        ctx.now
      );
      if (!limit.allowed) {
        throw new SubscriptionError(
          'RATE_LIMITED',
          'Too many failed management attempts. Please try again later.',
          429
        );
      }
      throw new SubscriptionError('UNAUTHORIZED', 'Invalid or revoked token', 401);
    }

    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (ctx.now.getTime() > expiresAt) {
      throw new SubscriptionError('EXPIRED_TOKEN', 'This token has expired', 401);
    }

    const subscriber = await this.subscriberRepo.findById(tokenRow.subscriber_id);
    if (!subscriber) {
      throw new SubscriptionError('UNAUTHORIZED', 'Subscriber not found', 401);
    }

    // Safe rotation: revoke other active management tokens for this subscriber
    // We only want to trigger this if there are actually other tokens, to avoid unnecessary writes.
    // But since it's a "successful use", we can just fire the rotation transaction blindly to ensure cleanup.
    // Let's do it if they have more than one valid token.
    const activeTokens = await this.tokenRepo.findValidTokens(
      subscriber.id,
      'manage_subscription',
      ctx.now.toISOString()
    );
    if (activeTokens.length > 1) {
      const auditParams = {
        id: `aud_${crypto.randomUUID()}`,
        type: 'SUBSCRIPTION_MANAGEMENT_TOKEN_ROTATED',
        deduplication_key: `rot_${tokenRow.id}`,
        subject_type: 'subscriber',
        subject_id: subscriber.id,
        payload: {},
        created_at: ctx.now.toISOString(),
      };
      await this.transactions.rotateManagementTokens(
        subscriber.id,
        tokenRow.id,
        auditParams,
        ctx.now.toISOString()
      );
    }

    return { tokenRow, subscriber };
  }

  async getSubscriptionInfo(rawToken: string, ctx: SubscriptionContext) {
    const { subscriber } = await this.authenticate(rawToken, ctx);
    return {
      state: subscriber.state,
      preferences: {
        probability70: subscriber.notify_70,
        resetAnnounced: subscriber.notify_announced,
      },
      updatedAt: subscriber.updated_at,
    };
  }

  async updatePreferences(
    rawToken: string,
    preferences: SubscriptionPreferences,
    ctx: SubscriptionContext
  ) {
    const validPrefs = SubscriptionValidator.validatePreferences(preferences);
    const { subscriber } = await this.authenticate(rawToken, ctx);

    if (subscriber.state !== 'active' && subscriber.state !== 'pending') {
      throw new SubscriptionError(
        'SUBSCRIPTION_NOT_MANAGEABLE',
        'Only active or pending subscriptions can be updated directly.'
      );
    }

    const auditParams = {
      id: `aud_${crypto.randomUUID()}`,
      type: 'SUBSCRIPTION_PREFERENCES_UPDATED',
      deduplication_key: `pref_${subscriber.id}_${ctx.now.getTime()}`,
      subject_type: 'subscriber',
      subject_id: subscriber.id,
      payload: validPrefs,
      created_at: ctx.now.toISOString(),
    };

    await this.transactions.updatePreferencesAtomically(
      subscriber.id,
      validPrefs.probability70,
      validPrefs.resetAnnounced,
      auditParams,
      ctx.now.toISOString()
    );

    return {
      state: subscriber.state,
      preferences: validPrefs,
      updatedAt: ctx.now.toISOString(),
    };
  }

  async unsubscribe(rawToken: string, ctx: SubscriptionContext) {
    const { subscriber } = await this.authenticate(rawToken, ctx);

    if (subscriber.state === 'unsubscribed') {
      return { success: true, message: 'Already unsubscribed' };
    }

    const auditParams = {
      id: `aud_${crypto.randomUUID()}`,
      type: 'SUBSCRIPTION_UNSUBSCRIBED',
      deduplication_key: `unsub_${subscriber.id}_${ctx.now.getTime()}`,
      subject_type: 'subscriber',
      subject_id: subscriber.id,
      payload: {},
      created_at: ctx.now.toISOString(),
    };

    await this.transactions.unsubscribeAtomically(
      subscriber.id,
      auditParams,
      ctx.now.toISOString()
    );

    return { success: true };
  }
}
