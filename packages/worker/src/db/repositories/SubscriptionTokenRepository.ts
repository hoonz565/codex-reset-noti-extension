import { SubscriptionTokenRow, mapSubscriptionTokenRow } from '../schema';

export interface CreateSubscriptionTokenParams {
  id: string;
  subscriber_id: string;
  purpose: 'confirm_subscription' | 'manage_subscription';
  token_hash: string;
  requested_probability70: boolean | null;
  requested_reset_announced: boolean | null;
  created_at: string;
  expires_at: string;
  consumed_at?: string | null;
  revoked_at?: string | null;
}

export class SubscriptionTokenRepository {
  constructor(private db: D1Database) {}

  async findByHash(tokenHash: string) {
    const stmt = this.db
      .prepare(`SELECT * FROM subscription_tokens WHERE token_hash = ?`)
      .bind(tokenHash);
    const row = await stmt.first<SubscriptionTokenRow>();
    return row ? mapSubscriptionTokenRow(row) : null;
  }

  async findValidTokens(subscriberId: string, purpose: string, now: string) {
    const stmt = this.db
      .prepare(
        `SELECT * FROM subscription_tokens 
         WHERE subscriber_id = ? 
           AND purpose = ? 
           AND consumed_at IS NULL 
           AND revoked_at IS NULL 
           AND expires_at > ?
         ORDER BY created_at ASC`
      )
      .bind(subscriberId, purpose, now);
    const result = await stmt.all<SubscriptionTokenRow>();
    return result.results.map(mapSubscriptionTokenRow);
  }

  getCreateStatement(params: CreateSubscriptionTokenParams) {
    return this.db
      .prepare(
        `INSERT INTO subscription_tokens (
          id, subscriber_id, purpose, token_hash, 
          requested_probability70, requested_reset_announced, 
          created_at, expires_at, consumed_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        params.id,
        params.subscriber_id,
        params.purpose,
        params.token_hash,
        params.requested_probability70 === null ? null : params.requested_probability70 ? 1 : 0,
        params.requested_reset_announced === null ? null : params.requested_reset_announced ? 1 : 0,
        params.created_at,
        params.expires_at,
        params.consumed_at || null,
        params.revoked_at || null
      );
  }

  getConsumeStatement(tokenId: string, consumedAt: string) {
    return this.db
      .prepare(`UPDATE subscription_tokens SET consumed_at = ? WHERE id = ?`)
      .bind(consumedAt, tokenId);
  }

  getRevokeStatement(tokenId: string, revokedAt: string) {
    return this.db
      .prepare(`UPDATE subscription_tokens SET revoked_at = ? WHERE id = ?`)
      .bind(revokedAt, tokenId);
  }

  getRevokeAllActivePurposeStatement(
    subscriberId: string,
    purpose: string,
    revokedAt: string,
    exceptTokenId?: string
  ) {
    if (exceptTokenId) {
      return this.db
        .prepare(
          `UPDATE subscription_tokens SET revoked_at = ? WHERE subscriber_id = ? AND purpose = ? AND id != ? AND revoked_at IS NULL AND consumed_at IS NULL`
        )
        .bind(revokedAt, subscriberId, purpose, exceptTokenId);
    }
    return this.db
      .prepare(
        `UPDATE subscription_tokens SET revoked_at = ? WHERE subscriber_id = ? AND purpose = ? AND revoked_at IS NULL AND consumed_at IS NULL`
      )
      .bind(revokedAt, subscriberId, purpose);
  }
}
