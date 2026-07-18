import { AuditEventRow, mapAuditEventRow } from '../schema';

export interface CreateAuditParams {
  id: string;
  type: string;
  deduplication_key: string | null;
  subject_type: string | null;
  subject_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export type CreateResult = 'inserted' | 'already_exists' | 'error';

export class AuditEventRepository {
  constructor(private db: D1Database) {}

  async create(params: CreateAuditParams) {
    const payloadJson = params.payload ? JSON.stringify(params.payload) : null;
    const stmt = this.db
      .prepare(
        `
      INSERT INTO audit_events (
        id, type, deduplication_key, subject_type, subject_id, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        params.id,
        params.type,
        params.deduplication_key,
        params.subject_type,
        params.subject_id,
        payloadJson,
        params.created_at
      );
    await stmt.run();
  }

  async createIfAbsentByDeduplicationKey(
    params: CreateAuditParams
  ): Promise<{ result: CreateResult }> {
    if (!params.deduplication_key) {
      throw new Error('deduplication_key is required for createIfAbsentByDeduplicationKey');
    }

    try {
      const payloadJson = params.payload ? JSON.stringify(params.payload) : null;
      const stmt = this.db
        .prepare(
          `
        INSERT INTO audit_events (
          id, type, deduplication_key, subject_type, subject_id, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(deduplication_key) DO NOTHING
      `
        )
        .bind(
          params.id,
          params.type,
          params.deduplication_key,
          params.subject_type,
          params.subject_id,
          payloadJson,
          params.created_at
        );

      const res = await stmt.run();
      if (res.meta.changes === 0) {
        return { result: 'already_exists' };
      }
      return { result: 'inserted' };
    } catch {
      return { result: 'error' };
    }
  }

  async listRecent(limit: number = 50) {
    const stmt = this.db
      .prepare(`SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?`)
      .bind(limit);
    const { results } = await stmt.all<AuditEventRow>();
    return results.map(mapAuditEventRow);
  }
}
