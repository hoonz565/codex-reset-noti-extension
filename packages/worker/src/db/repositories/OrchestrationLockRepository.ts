import { OrchestrationLockRow, mapOrchestrationLockRow } from '../schema';

export type AcquireLockResult =
  | { outcome: 'acquired'; previousOwnerId?: string }
  | { outcome: 'already_running'; activeOwnerId: string; expiresAt: string }
  | { outcome: 'error'; error: Error };

export class OrchestrationLockRepository {
  constructor(private db: D1Database) {}

  async acquire(name: string, ownerRunId: string, nowIso: string, expiresAtIso: string): Promise<AcquireLockResult> {
    try {
      const existing = await this.db.prepare(`SELECT * FROM orchestration_locks WHERE name = ?1`).bind(name).first<OrchestrationLockRow>();
      
      if (!existing) {
        // Insert if absent
        const res = await this.db.prepare(
          `INSERT INTO orchestration_locks (name, owner_run_id, acquired_at, expires_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?3)
           ON CONFLICT(name) DO NOTHING`
        ).bind(name, ownerRunId, nowIso, expiresAtIso).run();

        if (res.meta.changes > 0) {
          return { outcome: 'acquired' };
        }
        // If changes == 0, someone inserted right between our SELECT and INSERT. Let's recurse once.
        return this.acquire(name, ownerRunId, nowIso, expiresAtIso);
      }

      if (existing.expires_at <= nowIso) {
        // Expired, take over
        const previousOwnerId = existing.owner_run_id;
        const res = await this.db.prepare(
          `UPDATE orchestration_locks SET 
             owner_run_id = ?1, 
             acquired_at = ?2, 
             expires_at = ?3, 
             updated_at = ?2
           WHERE name = ?4 AND owner_run_id = ?5 AND expires_at <= ?2`
        ).bind(ownerRunId, nowIso, expiresAtIso, name, previousOwnerId).run();

        if (res.meta.changes > 0) {
          return { outcome: 'acquired', previousOwnerId };
        }
        // If changes == 0, someone else updated it between our SELECT and UPDATE. Let's recurse once.
        return this.acquire(name, ownerRunId, nowIso, expiresAtIso);
      }

      // Valid active lease
      return { outcome: 'already_running', activeOwnerId: existing.owner_run_id, expiresAt: existing.expires_at };
    } catch (e) {
      return { outcome: 'error', error: e instanceof Error ? e : new Error(String(e)) };
    }
  }

  async release(name: string, ownerRunId: string): Promise<boolean> {
    const res = await this.db.prepare(
      `DELETE FROM orchestration_locks WHERE name = ?1 AND owner_run_id = ?2`
    )
      .bind(name, ownerRunId)
      .run();
    return res.meta.changes > 0;
  }
}
