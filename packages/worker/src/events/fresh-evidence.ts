import { SourceSnapshotRow, mapSourceSnapshotRow } from '../db/schema';
import { FreshEvidenceResult } from './event-types';

export class FreshEvidencePolicy {
  /**
   * Evaluates if a snapshot is considered fresh evidence capable of triggering subscriber events.
   * Maps raw DB row to mapped type to ensure valid values before evaluation.
   */
  static evaluate(rawSnapshot: SourceSnapshotRow): FreshEvidenceResult {
    let snapshot;
    try {
      snapshot = mapSourceSnapshotRow(rawSnapshot);
    } catch {
      return { eligible: false, reason: 'INVALID_SNAPSHOT' };
    }

    if (!snapshot.reset_cycle_id) {
      return { eligible: false, reason: 'MISSING_CYCLE' };
    }

    // Explicitly check for unavailable before probability check to map correctly
    if (snapshot.source_health === 'unavailable') {
      return { eligible: false, reason: 'SOURCE_UNAVAILABLE' };
    }

    if (snapshot.probability === null) {
      return { eligible: false, reason: 'MISSING_PROBABILITY' };
    }

    if (!['healthy', 'degraded'].includes(snapshot.source_health)) {
      return { eligible: false, reason: 'INVALID_SNAPSHOT' };
    }

    return { eligible: true };
  }
}
