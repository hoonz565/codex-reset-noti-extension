import { SubscriberRow, mapSubscriberRow } from '../schema';

export interface CreateSubscriberParams {
  id: string;
  email: string;
  normalized_email: string;
  state: string;
  notify_70: boolean;
  notify_announced: boolean;
  management_token_hash: string;
  created_at: string;
}

export type CreateResult = 'inserted' | 'already_exists' | 'error';

export class SubscriberRepository {
  constructor(private db: D1Database) {}

  async findById(id: string) {
    const stmt = this.db.prepare(`SELECT * FROM subscribers WHERE id = ?`).bind(id);
    const row = await stmt.first<SubscriberRow>();
    return row ? mapSubscriberRow(row) : null;
  }

  async findByNormalizedEmail(normalizedEmail: string) {
    const stmt = this.db
      .prepare(`SELECT * FROM subscribers WHERE normalized_email = ?`)
      .bind(normalizedEmail);
    const row = await stmt.first<SubscriberRow>();
    return row ? mapSubscriberRow(row) : null;
  }

  async create(
    params: CreateSubscriberParams
  ): Promise<{ result: CreateResult; row?: SubscriberRow }> {
    try {
      const stmt = this.db
        .prepare(
          `
        INSERT INTO subscribers (
          id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(normalized_email) DO NOTHING
      `
        )
        .bind(
          params.id,
          params.email,
          params.normalized_email,
          params.state,
          params.notify_70 ? 1 : 0,
          params.notify_announced ? 1 : 0,
          params.management_token_hash,
          params.created_at,
          params.created_at
        );

      const res = await stmt.run();

      if (res.meta.changes === 0) {
        return { result: 'already_exists' };
      }

      return { result: 'inserted' };
    } catch {
      // Unrelated database failure
      return { result: 'error' };
    }
  }

  async updateState(id: string, state: string, updated_at: string) {
    const stmt = this.db
      .prepare(
        `
      UPDATE subscribers SET state = ?, updated_at = ? WHERE id = ?
    `
      )
      .bind(state, updated_at, id);
    await stmt.run();
  }

  async updatePreferences(
    id: string,
    notify70: boolean,
    notifyAnnounced: boolean,
    updated_at: string
  ) {
    const stmt = this.db
      .prepare(
        `
      UPDATE subscribers SET notify_70 = ?, notify_announced = ?, updated_at = ? WHERE id = ?
    `
      )
      .bind(notify70 ? 1 : 0, notifyAnnounced ? 1 : 0, updated_at, id);
    await stmt.run();
  }

  async updateTokenMetadata(id: string, newVersion: number, newHash: string, updated_at: string) {
    const stmt = this.db
      .prepare(
        `
      UPDATE subscribers SET token_version = ?, management_token_hash = ?, updated_at = ? WHERE id = ?
    `
      )
      .bind(newVersion, newHash, updated_at, id);
    await stmt.run();
  }
}
