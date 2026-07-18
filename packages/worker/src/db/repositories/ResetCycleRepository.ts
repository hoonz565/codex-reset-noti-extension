import { ResetCycleRow } from '../schema';

export interface CreateCycleParams {
  id: string;
  anchor_reset_at: string | null;
  state: string;
  created_at: string;
}

export type CreateResult = 'inserted' | 'already_exists' | 'error';

export class ResetCycleRepository {
  constructor(private db: D1Database) {}

  async findActive() {
    const stmt = this.db.prepare(`SELECT * FROM reset_cycles WHERE state = 'active'`);
    const row = await stmt.first<ResetCycleRow>();
    return row || null;
  }

  async findById(id: string) {
    const stmt = this.db.prepare(`SELECT * FROM reset_cycles WHERE id = ?`).bind(id);
    const row = await stmt.first<ResetCycleRow>();
    return row || null;
  }

  async create(params: CreateCycleParams): Promise<{ result: CreateResult }> {
    try {
      const stmt = this.db
        .prepare(
          `
        INSERT INTO reset_cycles (id, anchor_reset_at, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `
        )
        .bind(
          params.id,
          params.anchor_reset_at,
          params.state,
          params.created_at,
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

  async markCompletedOrSuperseded(
    id: string,
    newState: 'completed' | 'superseded',
    updated_at: string,
    completed_at: string | null = null
  ) {
    const stmt = this.db
      .prepare(
        `
      UPDATE reset_cycles SET state = ?, updated_at = ?, completed_at = ? WHERE id = ? AND state = 'active'
    `
      )
      .bind(newState, updated_at, completed_at, id);
    await stmt.run();
  }
}
