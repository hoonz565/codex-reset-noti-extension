/* eslint-disable @typescript-eslint/no-explicit-any */
import { OrchestrationRunRow, mapOrchestrationRunRow } from '../schema';

export type CreateRunParams = {
  id: string;
  trigger_type: 'scheduled' | 'admin';
  status: 'running' | 'completed' | 'completed_with_errors' | 'skipped_overlap' | 'failed';
  started_at: string;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type UpdateRunParams = {
  status?: 'completed' | 'completed_with_errors' | 'failed';
  finished_at?: string;
  source_outcome?: string | null;
  snapshot_id?: string | null;
  events_created?: number;
  deliveries_prepared?: number;
  deliveries_sent?: number;
  deliveries_retried?: number;
  deliveries_failed?: number;
  deliveries_cancelled?: number;
  stale_deliveries_recovered?: number;
  error_code?: string | null;
  updated_at: string;
};

export class OrchestrationRunRepository {
  constructor(private db: D1Database) {}

  async create(params: CreateRunParams): Promise<boolean> {
    try {
      const res = await this.db
        .prepare(
          `
        INSERT INTO orchestration_runs (
          id, trigger_type, status, started_at, finished_at, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        `
        )
        .bind(
          params.id,
          params.trigger_type,
          params.status,
          params.started_at,
          params.finished_at ?? null,
          params.created_at,
          params.updated_at
        )
        .run();
      return res.meta.changes > 0;
    } catch {
      return false;
    }
  }

  async update(id: string, params: UpdateRunParams): Promise<boolean> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined) {
        fields.push(`${key} = ?${idx}`);
        values.push(val);
        idx++;
      }
    }

    if (fields.length === 0) return true;

    values.push(id);
    const query = `UPDATE orchestration_runs SET ${fields.join(', ')} WHERE id = ?${idx} AND status = 'running'`;

    const res = await this.db
      .prepare(query)
      .bind(...values)
      .run();
    return res.meta.changes > 0;
  }

  async findById(id: string) {
    const row = await this.db
      .prepare(`SELECT * FROM orchestration_runs WHERE id = ?1`)
      .bind(id)
      .first<OrchestrationRunRow>();
    return row ? mapOrchestrationRunRow(row) : null;
  }

  async markStaleRunFailed(id: string, finishedAtIso: string): Promise<boolean> {
    // Only overwrite if it is currently 'running' (not already finalized)
    const res = await this.db
      .prepare(
        `
      UPDATE orchestration_runs 
      SET status = 'failed', error_code = 'LEASE_EXPIRED', finished_at = ?1, updated_at = ?1 
      WHERE id = ?2 AND status = 'running'
    `
      )
      .bind(finishedAtIso, id)
      .run();
    return res.meta.changes > 0;
  }
}
