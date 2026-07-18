import { CodexResetStatus } from '@codex-reset/shared';
import { ResetCycleRow } from '../db/schema';

export interface CycleResolutionResult {
  outcome: 'cycle_active' | 'cycle_transition_required' | 'bootstrap_required';
  cycleId?: string;
  newLatestResetAt?: string;
}

export class CycleStateResolver {
  static resolve(
    activeCycle: ResetCycleRow | null,
    currentStatus: CodexResetStatus,
    isFresh: boolean
  ): CycleResolutionResult {
    if (!activeCycle) {
      return { outcome: 'bootstrap_required' };
    }

    const latestResetAt = currentStatus.latestResetAt;

    // Only transition if snapshot is fresh and latestResetAt differs from anchor.
    // If it's empty, it means we don't have a latestResetAt (degraded source?), so don't transition.
    if (
      isFresh &&
      latestResetAt &&
      latestResetAt !== '' &&
      latestResetAt !== activeCycle.anchor_reset_at
    ) {
      return {
        outcome: 'cycle_transition_required',
        cycleId: activeCycle.id,
        newLatestResetAt: latestResetAt,
      };
    }

    return {
      outcome: 'cycle_active',
      cycleId: activeCycle.id,
    };
  }
}
