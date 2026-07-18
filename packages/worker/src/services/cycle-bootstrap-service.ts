import { ResetCycleRepository } from '../db/repositories/ResetCycleRepository';
import { AuditEventRepository } from '../db/repositories/AuditEventRepository';

export class CycleBootstrapService {
  constructor(
    private cycleRepo: ResetCycleRepository,
    private auditRepo: AuditEventRepository
  ) {}

  async bootstrapIfNecessary(now: Date): Promise<{
    cycleId: string;
    result: 'created' | 'already_exists' | 'repaired_missing_audit' | 'failed';
  }> {
    try {
      const cycleId = 'cycle:genesis';
      const createdAt = now.toISOString();

      const active = await this.cycleRepo.findActive();
      let cycleResult = 'already_exists';

      if (!active) {
        const res = await this.cycleRepo.create({
          id: cycleId,
          anchor_reset_at: null,
          state: 'active',
          created_at: createdAt,
        });
        cycleResult = res.result;
      }

      const auditRes = await this.auditRepo.createIfAbsentByDeduplicationKey({
        id: crypto.randomUUID(),
        type: 'BOOTSTRAP_COMPLETE',
        deduplication_key: 'BOOTSTRAP_COMPLETE:cycle:genesis',
        subject_type: 'reset_cycle',
        subject_id: cycleId,
        payload: { message: 'Genesis cycle bootstrapped' },
        created_at: createdAt,
      });

      if (cycleResult === 'inserted') {
        return { cycleId, result: 'created' };
      }

      if (auditRes.result === 'inserted') {
        return { cycleId, result: 'repaired_missing_audit' };
      }

      return { cycleId, result: 'already_exists' };
    } catch {
      return { cycleId: 'cycle:genesis', result: 'failed' };
    }
  }
}
