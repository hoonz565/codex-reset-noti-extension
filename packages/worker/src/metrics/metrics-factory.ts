import { D1MetricsRepository } from './metrics-repository';
import { MetricsReadService } from './metrics-read-service';

export function createMetricsReadService(db: D1Database): MetricsReadService {
  const repo = new D1MetricsRepository(db);
  return new MetricsReadService(repo);
}
