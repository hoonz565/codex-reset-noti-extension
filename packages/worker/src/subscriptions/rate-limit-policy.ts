import { RateLimitRepository } from '../db/repositories/RateLimitRepository';

export type RateLimitAction =
  | 'subscribe_cooldown'
  | 'subscribe_hourly'
  | 'subscribe_ip_hourly'
  | 'mgmt_link_cooldown'
  | 'mgmt_link_hourly'
  | 'confirm_attempt_ip'
  | 'mgmt_failure_ip'
  | 'unsubscribe_attempt_ip';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export class RateLimitPolicy {
  constructor(
    private repo: RateLimitRepository,
    private hmacSecret: string
  ) {}

  private async hashKey(identifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.hmacSecret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(identifier));
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async checkAndIncrement(
    identifier: string,
    action: RateLimitAction,
    maxCount: number,
    windowSeconds: number,
    nowDate: Date
  ): Promise<RateLimitResult> {
    const hashedKey = await this.hashKey(`${action}:${identifier}`);
    const record = await this.repo.getCurrent(hashedKey);

    const now = nowDate.getTime();

    if (record) {
      const expiresAt = new Date(record.expires_at).getTime();
      if (now < expiresAt && record.count >= maxCount) {
        const retryAfter = Math.ceil((expiresAt - now) / 1000);
        return { allowed: false, retryAfterSeconds: retryAfter };
      }
    }

    const newExpiresAt = new Date(now + windowSeconds * 1000).toISOString();
    const nowIso = nowDate.toISOString();

    await this.repo.incrementOrCreate(hashedKey, action, newExpiresAt, nowIso);

    return { allowed: true };
  }
}
