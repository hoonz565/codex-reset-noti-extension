import { SubscriptionTokenRepository } from '../db/repositories/SubscriptionTokenRepository';
import { SubscriberRepository } from '../db/repositories/SubscriberRepository';
import { RateLimitPolicy } from '../subscriptions/rate-limit-policy';
import { DbTransactions } from '../db/transactions';
import { TokenService, GeneratedToken } from '../subscriptions/token-service';
import { SubscriptionContext } from '../subscriptions/subscription-types';
import { SubscriptionError } from '../subscriptions/subscription-errors';

export class ConfirmationService {
  constructor(
    private tokenRepo: SubscriptionTokenRepository,
    private subscriberRepo: SubscriberRepository,
    private rateLimitPolicy: RateLimitPolicy,
    private transactions: DbTransactions
  ) {}

  async confirm(
    rawToken: string,
    ctx: SubscriptionContext
  ): Promise<{ managementToken: GeneratedToken }> {
    // 1. Rate Limit
    const limit = await this.rateLimitPolicy.checkAndIncrement(
      ctx.ipAddress,
      'confirm_attempt_ip',
      10,
      900,
      ctx.now
    );
    if (!limit.allowed) {
      throw new SubscriptionError(
        'RATE_LIMITED',
        'Too many confirmation attempts. Please try again later.'
      );
    }

    // 2. Token Lookup
    let tokenHash: string;
    try {
      tokenHash = await TokenService.hashToken(rawToken);
    } catch {
      throw new SubscriptionError('INVALID_TOKEN', 'The provided token format is invalid.');
    }

    const tokenRow = await this.tokenRepo.findByHash(tokenHash);
    if (!tokenRow) {
      throw new SubscriptionError('INVALID_TOKEN', 'The provided token is invalid.');
    }

    // 3. Expiry and State Validation
    if (tokenRow.purpose !== 'confirm_subscription') {
      throw new SubscriptionError('INVALID_TOKEN', 'Invalid token purpose.');
    }

    if (tokenRow.revoked_at) {
      throw new SubscriptionError('INVALID_TOKEN', 'This token has been revoked.');
    }

    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (ctx.now.getTime() > expiresAt) {
      throw new SubscriptionError('EXPIRED_TOKEN', 'This token has expired.');
    }

    // If already consumed, we can treat it as idempotent success if we want,
    // but typically we can just throw ALREADY_USED or return success if the subscriber is already active.
    if (tokenRow.consumed_at) {
      const subscriber = await this.subscriberRepo.findById(tokenRow.subscriber_id);
      if (subscriber?.state === 'active') {
        throw new SubscriptionError(
          'TOKEN_ALREADY_USED',
          'This subscription is already confirmed.'
        );
      }
      throw new SubscriptionError('INVALID_TOKEN', 'This token has already been consumed.');
    }

    // 4. Generate Management Token (30 days)
    const mgmtToken = await TokenService.generate();
    const mgmtExpiresAt = new Date(ctx.now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const mgmtTokenParams = {
      id: `tok_${crypto.randomUUID()}`,
      subscriber_id: tokenRow.subscriber_id,
      purpose: 'manage_subscription' as const,
      token_hash: mgmtToken.hashHex,
      requested_probability70: null,
      requested_reset_announced: null,
      created_at: ctx.now.toISOString(),
      expires_at: mgmtExpiresAt,
    };

    const auditParams = {
      id: `aud_${crypto.randomUUID()}`,
      type: 'SUBSCRIPTION_CONFIRMED',
      deduplication_key: `cnf_${tokenRow.id}`,
      subject_type: 'subscriber',
      subject_id: tokenRow.subscriber_id,
      payload: {},
      created_at: ctx.now.toISOString(),
    };

    // 5. Transaction
    await this.transactions.confirmSubscription(
      tokenRow.id,
      tokenRow.subscriber_id,
      {
        notify_70: tokenRow.requested_probability70 ?? false,
        notify_announced: tokenRow.requested_reset_announced ?? false,
      },
      mgmtTokenParams,
      auditParams,
      ctx.now.toISOString()
    );

    return { managementToken: mgmtToken };
  }
}
