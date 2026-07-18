import { SourceSnapshotRow, mapSourceSnapshotRow } from '../db/schema';
import { EventCandidate } from './event-types';

export class EventCandidateDetector {
  /**
   * Detects event candidates by comparing the current fresh snapshot with the previous fresh snapshot.
   */
  static detect(
    previousSnapshot: SourceSnapshotRow | null,
    currentSnapshot: SourceSnapshotRow
  ): EventCandidate[] {
    const candidates: EventCandidate[] = [];

    // We expect both to be pre-validated by FreshEvidencePolicy, but let's map current anyway
    const current = mapSourceSnapshotRow(currentSnapshot);

    const prevProb = previousSnapshot ? previousSnapshot.probability : null;
    const currProb = current.probability;

    // 1. Check PROBABILITY_REACHED_70
    if (currProb !== null && currProb >= 70) {
      if (prevProb === null || prevProb < 70) {
        // Condition met. Note: If prevProb is null (baseline establish),
        // the external policy might suppress this to prevent catch-up events.
        candidates.push({
          type: 'PROBABILITY_REACHED_70',
          condition: {
            threshold: 70,
            previous_probability: prevProb,
            current_probability: currProb,
            source_snapshot_id: current.id,
          },
        });
      }
    }

    // 2. Check RESET_ANNOUNCED
    if (current.lifecycle === 'announced') {
      const wasAnnounced = previousSnapshot?.lifecycle === 'announced';
      if (!wasAnnounced) {
        candidates.push({
          type: 'RESET_ANNOUNCED',
          condition: {
            threshold: null,
            previous_probability: prevProb,
            current_probability: currProb,
            source_snapshot_id: current.id,
          },
        });
      }
    }

    return candidates;
  }
}
