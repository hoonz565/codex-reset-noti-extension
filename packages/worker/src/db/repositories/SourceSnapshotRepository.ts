import { SourceSnapshotRow, mapSourceSnapshotRow } from '../schema';

export interface CreateSnapshotParams {
  id: string;
  reset_cycle_id: string | null;
  probability: number | null;
  lifecycle: string;
  source_health: string;
  source_updated_at: string | null;
  checked_at: string;
  payload_hash: string;
  meaningful_change: boolean;
  created_at: string;
}

export class SourceSnapshotRepository {
  constructor(private db: D1Database) {}

  async create(params: CreateSnapshotParams) {
    const stmt = this.db
      .prepare(
        `
      INSERT INTO source_snapshots (
        id, reset_cycle_id, probability, lifecycle, source_health, source_updated_at, checked_at, payload_hash, meaningful_change, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        params.id,
        params.reset_cycle_id,
        params.probability,
        params.lifecycle,
        params.source_health,
        params.source_updated_at,
        params.checked_at,
        params.payload_hash,
        params.meaningful_change ? 1 : 0,
        params.created_at
      );
    await stmt.run();
  }

  async findById(id: string) {
    const stmt = this.db.prepare(`SELECT * FROM source_snapshots WHERE id = ?`).bind(id);
    const row = await stmt.first<SourceSnapshotRow>();
    return row || null;
  }

  async findLatestValidBefore(snapshotId: string, cycleId: string) {
    const stmt = this.db
      .prepare(
        `
      SELECT * FROM source_snapshots 
      WHERE reset_cycle_id = ? 
        AND id != ? 
        AND source_health IN ('healthy', 'degraded') 
        AND probability IS NOT NULL
      ORDER BY created_at DESC 
      LIMIT 1
    `
      )
      .bind(cycleId, snapshotId);
    const row = await stmt.first<SourceSnapshotRow>();
    return row || null;
  }

  async findLatest() {
    const stmt = this.db.prepare(`SELECT * FROM source_snapshots ORDER BY created_at DESC LIMIT 1`);
    const row = await stmt.first<SourceSnapshotRow>();
    return row || null;
  }

  async findLatestValid() {
    // A valid snapshot is one where probability is not null, indicating source_health was likely 'healthy' or 'degraded' with valid data.
    const stmt = this.db.prepare(
      `SELECT * FROM source_snapshots WHERE probability IS NOT NULL ORDER BY created_at DESC LIMIT 1`
    );
    const row = await stmt.first<SourceSnapshotRow>();
    return row || null;
  }

  async listMeaningful(limit: number = 10) {
    const stmt = this.db
      .prepare(
        `SELECT * FROM source_snapshots WHERE meaningful_change = 1 ORDER BY created_at DESC LIMIT ?`
      )
      .bind(limit);
    const { results } = await stmt.all<SourceSnapshotRow>();
    return results.map(mapSourceSnapshotRow);
  }
}
