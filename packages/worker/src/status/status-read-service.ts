import { PublicResetStatus } from '@codex-reset/shared';
import { StatusRepository } from './status-repository';
import { STATUS_FRESHNESS_SECONDS } from './status-config';

export class StatusReadService {
  constructor(private repo: StatusRepository) {}

  async getPublicStatus(now: Date): Promise<PublicResetStatus> {
    const latestSnapshot = await this.repo.getLatestSnapshot();

    if (!latestSnapshot) {
      return {
        state: 'empty',
        probability: null,
        lastKnownProbability: null,
        lastKnownObservedAt: null,
        resetAnnounced: false,
        latestResetAt: null,
        resetCycleId: null,
        checkedAt: null,
      };
    }

    const activeCycle = await this.repo.getActiveCycle();
    let resetAnnounced = false;
    let latestResetAt = null;
    let resetCycleId = null;

    if (activeCycle) {
      resetCycleId = activeCycle.id;
      latestResetAt = activeCycle.anchor_reset_at;
      resetAnnounced = await this.repo.hasResetAnnouncedEvent(activeCycle.id);
    }

    const checkTime = new Date(latestSnapshot.checked_at);
    const ageSeconds = (now.getTime() - checkTime.getTime()) / 1000;

    // Malformed or future timestamps are treated as unavailable
    if (isNaN(checkTime.getTime()) || ageSeconds < 0) {
      const latestTrusted = await this.repo.getLatestTrustedSnapshot();
      return {
        state: 'unavailable',
        probability: null,
        lastKnownProbability: latestTrusted?.probability ?? null,
        lastKnownObservedAt: latestTrusted?.checked_at ?? null,
        resetAnnounced,
        latestResetAt,
        resetCycleId,
        checkedAt: latestSnapshot.checked_at,
      };
    }

    if (latestSnapshot.source_health === 'unavailable') {
      const latestTrusted = await this.repo.getLatestTrustedSnapshot();
      return {
        state: 'unavailable',
        probability: null,
        lastKnownProbability: latestTrusted?.probability ?? null,
        lastKnownObservedAt: latestTrusted?.checked_at ?? null,
        resetAnnounced,
        latestResetAt,
        resetCycleId,
        checkedAt: latestSnapshot.checked_at,
      };
    }

    if (ageSeconds > STATUS_FRESHNESS_SECONDS) {
      return {
        state: 'stale',
        probability: latestSnapshot.probability!,
        lastKnownProbability: null,
        lastKnownObservedAt: null,
        resetAnnounced,
        latestResetAt,
        resetCycleId,
        checkedAt: latestSnapshot.checked_at,
      };
    }

    return {
      state: 'fresh',
      probability: latestSnapshot.probability!,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced,
      latestResetAt,
      resetCycleId,
      checkedAt: latestSnapshot.checked_at,
    };
  }
}
