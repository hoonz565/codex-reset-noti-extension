import { OrchestrationLockRepository } from '../db/repositories/OrchestrationLockRepository';
import { OrchestrationRunRepository } from '../db/repositories/OrchestrationRunRepository';

export class OrchestrationLock {
  constructor(
    private lockRepo: OrchestrationLockRepository,
    private runRepo: OrchestrationRunRepository,
    private lockName: string = 'global_orchestration'
  ) {}

  async acquire(runId: string, nowIso: string, expiresAtIso: string): Promise<boolean> {
    const res = await this.lockRepo.acquire(this.lockName, runId, nowIso, expiresAtIso);
    
    if (res.outcome === 'acquired') {
      if (res.previousOwnerId) {
        // We took over an expired lock. Stale run repair!
        await this.runRepo.markStaleRunFailed(res.previousOwnerId, nowIso);
      }
      return true;
    }
    
    if (res.outcome === 'already_running') {
      return false;
    }

    // Unrelated DB error => throws critical
    throw new Error('Database failure while acquiring lock: ' + (res as any).error?.message);
  }

  async release(runId: string): Promise<boolean> {
    return this.lockRepo.release(this.lockName, runId);
  }
}
