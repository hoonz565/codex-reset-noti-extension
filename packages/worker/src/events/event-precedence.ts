import { EventCandidate } from './event-types';
import { CreateAuditParams } from '../db/repositories/AuditEventRepository';

export interface PrecedenceResult {
  winningCandidate: EventCandidate | null;
  suppressionAudit: CreateAuditParams | null;
}

export class EventPrecedenceResolver {
  static resolve(
    cycleId: string,
    snapshotId: string,
    candidates: EventCandidate[],
    now: Date
  ): PrecedenceResult {
    if (candidates.length === 0) {
      return { winningCandidate: null, suppressionAudit: null };
    }

    if (candidates.length === 1) {
      return { winningCandidate: candidates[0], suppressionAudit: null };
    }

    // Both candidates present
    const announced = candidates.find((c) => c.type === 'RESET_ANNOUNCED');
    const prob = candidates.find((c) => c.type === 'PROBABILITY_REACHED_70');

    if (announced && prob) {
      const auditParams: CreateAuditParams = {
        id: crypto.randomUUID(),
        type: 'EVENT_CANDIDATES_SUPPRESSED',
        deduplication_key: `EVENT_CANDIDATES_SUPPRESSED:${cycleId}:${snapshotId}:PROBABILITY_REACHED_70:RESET_ANNOUNCED`,
        subject_type: 'reset_cycle',
        subject_id: cycleId,
        payload: {
          cycleId,
          snapshotId,
          winningCandidate: announced.type,
          suppressedCandidates: [prob.type],
          reason:
            'RESET_ANNOUNCED takes precedence over PROBABILITY_REACHED_70 in the same snapshot',
        },
        created_at: now.toISOString(),
      };

      return {
        winningCandidate: announced,
        suppressionAudit: auditParams,
      };
    }

    // Fallback if there are duplicates (shouldn't happen)
    return { winningCandidate: candidates[0], suppressionAudit: null };
  }
}
