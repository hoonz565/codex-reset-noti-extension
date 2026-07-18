import { RateLimitRecordRow } from '../schema';

export class RateLimitRepository {
  constructor(private db: D1Database) {}

  async incrementOrCreate(key: string, actionType: string, expiresAt: string, createdAt: string) {
    await this.getIncrementOrCreateStatement(key, actionType, expiresAt, createdAt).run();
  }

  getIncrementOrCreateStatement(
    key: string,
    actionType: string,
    expiresAt: string,
    createdAt: string
  ) {
    return this.db
      .prepare(
        `
      INSERT INTO rate_limit_records (key, action_type, count, expires_at, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET 
        count = count + 1, 
        updated_at = excluded.updated_at
    `
      )
      .bind(key, actionType, expiresAt, createdAt, createdAt);
  }

  async getCurrent(key: string) {
    const stmt = this.db.prepare(`SELECT * FROM rate_limit_records WHERE key = ?`).bind(key);
    const row = await stmt.first<RateLimitRecordRow>();
    return row || null;
  }

  async deleteExpired(now: string) {
    const stmt = this.db.prepare(`DELETE FROM rate_limit_records WHERE expires_at <= ?`).bind(now);
    await stmt.run();
  }
}
