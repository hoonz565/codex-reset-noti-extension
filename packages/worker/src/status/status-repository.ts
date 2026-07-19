export interface StatusSnapshotData {
  probability: number | null;
  source_health: string;
  checked_at: string;
}

export interface StatusCycleData {
  id: string;
  anchor_reset_at: string | null;
}

export interface StatusRepository {
  getLatestSnapshot(): Promise<StatusSnapshotData | null>;
  getLatestTrustedSnapshot(): Promise<StatusSnapshotData | null>;
  getActiveCycle(): Promise<StatusCycleData | null>;
  hasResetAnnouncedEvent(cycleId: string): Promise<boolean>;
}

export class D1StatusRepository implements StatusRepository {
  constructor(private db: D1Database) {}

  async getLatestSnapshot(): Promise<StatusSnapshotData | null> {
    const stmt = this.db.prepare(
      `SELECT probability, source_health, checked_at 
       FROM source_snapshots 
       ORDER BY created_at DESC 
       LIMIT 1`
    );
    const row = await stmt.first<StatusSnapshotData>();
    return row || null;
  }

  async getLatestTrustedSnapshot(): Promise<StatusSnapshotData | null> {
    const stmt = this.db.prepare(
      `SELECT probability, source_health, checked_at 
       FROM source_snapshots 
       WHERE source_health IN ('healthy', 'degraded') 
         AND probability IS NOT NULL
       ORDER BY created_at DESC 
       LIMIT 1`
    );
    const row = await stmt.first<StatusSnapshotData>();
    return row || null;
  }

  async getActiveCycle(): Promise<StatusCycleData | null> {
    const stmt = this.db.prepare(
      `SELECT id, anchor_reset_at 
       FROM reset_cycles 
       WHERE state = 'active' 
       LIMIT 1`
    );
    const row = await stmt.first<StatusCycleData>();
    return row || null;
  }

  async hasResetAnnouncedEvent(cycleId: string): Promise<boolean> {
    const stmt = this.db
      .prepare(
        `SELECT 1 
         FROM reset_events 
         WHERE reset_cycle_id = ? AND type = 'RESET_ANNOUNCED' 
         LIMIT 1`
      )
      .bind(cycleId);
    const row = await stmt.first();
    return row !== null;
  }
}
