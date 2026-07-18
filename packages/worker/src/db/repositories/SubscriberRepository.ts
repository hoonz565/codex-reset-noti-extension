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

  async createIfNotExists(
    params: CreateSubscriberParams
  ): Promise<
    | { outcome: 'inserted' }
    | { outcome: 'already_exists'; subscriber: ReturnType<typeof mapSubscriberRow> }
    | { outcome: 'inconsistency' }
    | { outcome: 'failed'; error: unknown }
  > {
    try {
      const stmt = this.getCreateStatement(params);
      const res = await stmt.run();

      if (res.meta.changes === 0) {
        const existing = await this.findByNormalizedEmail(params.normalized_email);
        if (!existing) return { outcome: 'inconsistency' };
        return { outcome: 'already_exists', subscriber: existing };
      }

      return { outcome: 'inserted' };
    } catch (e) {
      return { outcome: 'failed', error: e };
    }
  }

  getCreateStatement(params: CreateSubscriberParams) {
    return this.db
      .prepare(
        `INSERT INTO subscribers (
          id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(normalized_email) DO NOTHING`
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
  }
  async updateState(id: string, state: string, updated_at: string) {
    await this.getUpdateStateStatement(id, state, updated_at).run();
  }

  getUpdateStateStatement(id: string, state: string, updated_at: string) {
    return this.db
      .prepare(`UPDATE subscribers SET state = ?, updated_at = ? WHERE id = ?`)
      .bind(state, updated_at, id);
  }

  async updatePreferences(
    id: string,
    notify70: boolean,
    notifyAnnounced: boolean,
    updated_at: string
  ) {
    await this.getUpdatePreferencesStatement(id, notify70, notifyAnnounced, updated_at).run();
  }

  getUpdatePreferencesStatement(
    id: string,
    notify70: boolean,
    notifyAnnounced: boolean,
    updated_at: string
  ) {
    return this.db
      .prepare(
        `UPDATE subscribers SET notify_70 = ?, notify_announced = ?, updated_at = ? WHERE id = ?`
      )
      .bind(notify70 ? 1 : 0, notifyAnnounced ? 1 : 0, updated_at, id);
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
