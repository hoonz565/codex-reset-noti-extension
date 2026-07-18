import { SubscriberEventType } from '@codex-reset/shared';

// Fresh Evidence
export type FreshEvidenceResult =
  | { eligible: true }
  | {
      eligible: false;
      reason: 'SOURCE_UNAVAILABLE' | 'MISSING_PROBABILITY' | 'MISSING_CYCLE' | 'INVALID_SNAPSHOT';
    };

// Candidates
export interface CandidateCondition {
  threshold: number | null;
  previous_probability: number | null;
  current_probability: number | null;
  source_snapshot_id: string;
}

export interface EventCandidate {
  type: SubscriberEventType;
  condition: CandidateCondition;
}

// Processing Service Outcomes
export type EventProcessingError = 'DATABASE_ERROR' | 'INVALID_ARGUMENT';

export type EventProcessingResult =
  | {
      outcome: 'baseline_established';
      cycleId: string;
    }
  | {
      outcome: 'no_event';
      cycleId: string;
      reasons: string[];
    }
  | {
      outcome: 'event_created';
      cycleId: string;
      eventId: string;
      event: EventCandidate;
    }
  | {
      outcome: 'event_already_exists';
      cycleId: string;
      eventType: SubscriberEventType;
    }
  | {
      outcome: 'cycle_transitioned';
      oldCycleId: string;
      newCycleId: string;
    }
  | {
      outcome: 'cycle_already_transitioned';
      oldCycleId: string;
      newCycleId: string;
    }
  | {
      outcome: 'stale_precondition';
      reason: string;
    }
  | {
      outcome: 'ineligible_snapshot';
      reason: string;
    }
  | {
      outcome: 'failed';
      error: EventProcessingError;
    };
