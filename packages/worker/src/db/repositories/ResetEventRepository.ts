import { ResetEventRow, mapResetEventRow } from '../schema';

export interface CreateEventParams {
  id: string;
  reset_cycle_id: string;
  type: string;
  threshold: number | null;
  previous_probability: number | null;
  current_probability: number | null;
  source_signal_id: string | null;
  source_snapshot_id: string;
  created_at: string;
}

export type CreateResult = 'inserted' | 'already_exists' | 'error';

export class ResetEventRepository {
  constructor(private db: D1Database) {}

  async createIfAbsent(params: CreateEventParams): Promise<{ result: CreateResult }> {
    try {
      const stmt = this.db
        .prepare(
          `
        INSERT INTO reset_events (
          id, reset_cycle_id, type, threshold, previous_probability, current_probability, source_signal_id, source_snapshot_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(reset_cycle_id, type) DO NOTHING
      `
        )
        .bind(
          params.id,
          params.reset_cycle_id,
          params.type,
          params.threshold,
          params.previous_probability,
          params.current_probability,
          params.source_signal_id,
          params.source_snapshot_id,
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

  async findByCycleAndType(cycleId: string, type: string) {
    const stmt = this.db
      .prepare(`SELECT * FROM reset_events WHERE reset_cycle_id = ? AND type = ?`)
      .bind(cycleId, type);
    const row = await stmt.first<ResetEventRow>();
    return row ? mapResetEventRow(row) : null;
  }

  async listByCycle(cycleId: string) {
    const stmt = this.db
      .prepare(`SELECT * FROM reset_events WHERE reset_cycle_id = ? ORDER BY created_at ASC`)
      .bind(cycleId);
    const { results } = await stmt.all<ResetEventRow>();
    return results.map(mapResetEventRow);
  }
}
