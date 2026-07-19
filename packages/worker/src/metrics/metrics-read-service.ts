import { AdminMetricsResponse, MetricsWindow } from '@codex-reset/shared';
import { MetricsRepository } from './metrics-repository';
import { STATUS_FRESHNESS_SECONDS } from '../status/status-config';

export class MetricsReadService {
  constructor(private repo: MetricsRepository) {}

  async getMetrics(windowStr: string, now: Date): Promise<AdminMetricsResponse> {
    const windowMap: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };

    if (!['1h', '24h', '7d'].includes(windowStr)) {
      throw new Error('Invalid window parameter');
    }

    const windowDurationMs = windowMap[windowStr];
    const startAt = new Date(now.getTime() - windowDurationMs).toISOString();
    const endAt = now.toISOString();

    const orchestration = await this.repo.getOrchestrationMetrics({ startAt, endAt });
    const source = await this.repo.getSourceMetrics();
    const events = await this.repo.getEventsMetrics({ startAt, endAt });
    const deliveries = await this.repo.getDeliveriesMetrics(now);

    let freshnessState: 'empty' | 'unavailable' | 'stale' | 'fresh' = 'empty';
    if (source.latestCheckedAt) {
      const checkTime = new Date(source.latestCheckedAt);
      const ageSeconds = (now.getTime() - checkTime.getTime()) / 1000;

      if (isNaN(checkTime.getTime()) || ageSeconds < 0 || source.latestHealth === 'unavailable') {
        freshnessState = 'unavailable';
      } else if (ageSeconds > STATUS_FRESHNESS_SECONDS) {
        freshnessState = 'stale';
      } else {
        freshnessState = 'fresh';
      }
    }

    return {
      schemaVersion: 1,
      window: windowStr as MetricsWindow,
      generatedAt: endAt,
      orchestration,
      source: {
        ...source,
        freshnessState,
      },
      events,
      deliveries,
    };
  }
}
