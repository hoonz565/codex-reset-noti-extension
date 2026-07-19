/* eslint-disable @typescript-eslint/no-unused-vars */
import { SnapshotCheckResult } from './snapshot-service';
import { DbTransactions } from '../db/transactions';
import { ResetCycleRepository } from '../db/repositories/ResetCycleRepository';
import { ResetEventRepository } from '../db/repositories/ResetEventRepository';
import { SourceSnapshotRepository } from '../db/repositories/SourceSnapshotRepository';
import { AuditEventRepository } from '../db/repositories/AuditEventRepository';
import { CycleStateResolver } from '../events/cycle-resolver';
import { FreshEvidencePolicy } from '../events/fresh-evidence';
import { EventCandidateDetector } from '../events/event-candidates';
import { EventPrecedenceResolver } from '../events/event-precedence';
import { EventProcessingResult, EventCandidate } from '../events/event-types';

export class EventProcessingService {
  constructor(
    private transactions: DbTransactions,
    private cycleRepo: ResetCycleRepository,
    private eventRepo: ResetEventRepository,
    private snapshotRepo: SourceSnapshotRepository,
    private auditRepo: AuditEventRepository
  ) {}

  async process(snapshotResult: SnapshotCheckResult, now: Date): Promise<EventProcessingResult> {
    if (snapshotResult.outcome === 'failed') {
      return { outcome: 'failed', error: 'DATABASE_ERROR' };
    }
    if (snapshotResult.outcome === 'bootstrap_prerequisite_missing') {
      return { outcome: 'stale_precondition', reason: snapshotResult.reason };
    }

    const { snapshotId, status } = snapshotResult;

    // 1. Fetch the persisted snapshot
    const currentSnapshot = await this.snapshotRepo.findById(snapshotId);
    if (!currentSnapshot) {
      return { outcome: 'failed', error: 'DATABASE_ERROR' };
    }

    // 2. Fresh Evidence Policy
    const freshResult = FreshEvidencePolicy.evaluate(currentSnapshot);
    const isFresh = freshResult.eligible;

    // 3. Active Cycle & Transition Check
    const activeCycle = await this.cycleRepo.findActive();
    const cycleResolution = CycleStateResolver.resolve(activeCycle, status, isFresh);

    if (cycleResolution.outcome === 'bootstrap_required') {
      return { outcome: 'stale_precondition', reason: 'No active cycle found during processing' };
    }

    if (cycleResolution.outcome === 'cycle_transition_required') {
      const oldCycleId = cycleResolution.cycleId!;
      const newLatestResetAt = cycleResolution.newLatestResetAt!;
      const newCycleId = `cycle:${newLatestResetAt}`;

      const transitionRes = await this.transactions.performCycleTransition(
        {
          id: crypto.randomUUID(),
          type: 'RESET_COMPLETED',
          deduplication_key: `RESET_COMPLETED:${newCycleId}`,
          subject_type: 'reset_cycle',
          subject_id: oldCycleId,
          payload: { newCycleId, newLatestResetAt },
          created_at: now.toISOString(),
        },
        oldCycleId,
        now.toISOString(),
        {
          id: newCycleId,
          anchor_reset_at: newLatestResetAt,
          state: 'active',
          created_at: now.toISOString(),
        },
        snapshotId
      );

      if (transitionRes.outcome === 'transitioned') {
        return { outcome: 'cycle_transitioned', oldCycleId, newCycleId };
      } else if (transitionRes.outcome === 'already_transitioned') {
        return { outcome: 'cycle_already_transitioned', oldCycleId, newCycleId };
      } else {
        return { outcome: 'stale_precondition', reason: 'Transition precondition failed' };
      }
    }

    if (!isFresh) {
      return { outcome: 'ineligible_snapshot', reason: freshResult.reason };
    }

    const cycleId = cycleResolution.cycleId!;

    // 4. Candidate Detection
    const previousSnapshot = await this.snapshotRepo.findLatestValidBefore(snapshotId, cycleId);

    if (!previousSnapshot) {
      // First fresh snapshot in this cycle -> baseline established
      return { outcome: 'baseline_established', cycleId };
    }

    const candidates = EventCandidateDetector.detect(previousSnapshot, currentSnapshot);

    // 5. Precedence
    const precedence = EventPrecedenceResolver.resolve(cycleId, snapshotId, candidates, now);

    if (precedence.suppressionAudit) {
      await this.auditRepo.createIfAbsentByDeduplicationKey(precedence.suppressionAudit);
    }

    const winner = precedence.winningCandidate;
    if (!winner) {
      return { outcome: 'no_event', cycleId, reasons: ['No candidates detected'] };
    }

    // 6. Idempotency & Persistence
    const newEventId = crypto.randomUUID();
    const eventRes = await this.eventRepo.createIfAbsent({
      id: newEventId,
      reset_cycle_id: cycleId,
      type: winner.type,
      threshold: winner.condition.threshold,
      previous_probability: winner.condition.previous_probability,
      current_probability: winner.condition.current_probability,
      source_signal_id: status.latestSignal?.id || null,
      source_snapshot_id: winner.condition.source_snapshot_id,
      created_at: now.toISOString(),
    });

    if (eventRes.result === 'already_exists') {
      return { outcome: 'event_already_exists', cycleId, eventType: winner.type };
    }
    if (eventRes.result === 'error') {
      return { outcome: 'failed', error: 'DATABASE_ERROR' };
    }

    return { outcome: 'event_created', cycleId, eventId: newEventId, event: winner };
  }
}
