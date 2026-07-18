import { RawForecastSchema, type RawForecastData } from './raw-forecast-schema';
import type { SourceHealth, LatestSignal } from './source-types';

export interface NormalizedSource {
  probability: number | null;
  lifecycle: 'announced' | 'completed' | null;
  latestResetAt: string | null;
  sourceHealth: SourceHealth;
  latestSignal: LatestSignal | null;
  sourceWarnings: string[];
}

export type ProbabilityNormalizationResult =
  | {
      ok: true;
      probability: number;
    }
  | {
      ok: false;
      reason: 'MISSING_SCORE' | 'INVALID_SCORE_TYPE' | 'SCORE_NOT_FINITE' | 'SCORE_OUT_OF_RANGE';
    };

export class SourceNormalizer {
  static validate(rawPayload: unknown): RawForecastData {
    return RawForecastSchema.parse(rawPayload);
  }

  static normalizeProbability(score: number | undefined | null): ProbabilityNormalizationResult {
    if (score === undefined || score === null) {
      return { ok: false, reason: 'MISSING_SCORE' };
    }
    if (typeof score !== 'number') {
      return { ok: false, reason: 'INVALID_SCORE_TYPE' };
    }
    if (!Number.isFinite(score) || Number.isNaN(score)) {
      return { ok: false, reason: 'SCORE_NOT_FINITE' };
    }
    if (score < 0 || score > 100) {
      return { ok: false, reason: 'SCORE_OUT_OF_RANGE' };
    }
    return { ok: true, probability: score };
  }

  static normalizeLifecycle(
    resetAnnounced: boolean | undefined,
    _hoursSinceReset: number | undefined,
    _latestResetAt: string | undefined
  ): 'announced' | 'completed' | null {
    if (resetAnnounced === true) {
      return 'announced';
    }
    // We do not infer completed from hoursSinceReset according to Phase 0.5.
    // latestResetAt changes detect completed in Phase 4.
    // So Phase 3 normalizer returns null unless it's explicitly announced.
    return null;
  }
}
