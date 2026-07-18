import type { RawForecastData } from './raw-forecast-schema';
import { SourceNormalizer } from './source-normalizer';
import type { SourceHealth } from './source-types';

export class SourceHealthResolver {
  static resolve(
    raw: RawForecastData | null,
    fetchSucceeded: boolean
  ): {
    health: SourceHealth;
    warnings: string[];
    probability: number | null;
  } {
    if (!fetchSucceeded || !raw) {
      return { health: 'unavailable', warnings: ['NETWORK_FAILURE'], probability: null };
    }

    if (!raw.forecast) {
      return { health: 'unavailable', warnings: ['MISSING_FORECAST'], probability: null };
    }

    const probResult = SourceNormalizer.normalizeProbability(raw.forecast.score);

    if (!probResult.ok) {
      return { health: 'unavailable', warnings: [probResult.reason], probability: null };
    }

    const probability = probResult.probability;

    const warnings: string[] = [];
    if (raw.sourceErrors && Object.keys(raw.sourceErrors).length > 0) {
      warnings.push('PARTIAL_SOURCE_ERRORS');
    }

    // Cap warnings to prevent unbounded growth
    const cappedWarnings = warnings.slice(0, 10);

    const health: SourceHealth = cappedWarnings.length > 0 ? 'degraded' : 'healthy';

    return {
      health,
      warnings: cappedWarnings,
      probability,
    };
  }
}
