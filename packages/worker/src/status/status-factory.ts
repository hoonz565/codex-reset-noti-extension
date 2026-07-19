import { D1StatusRepository } from './status-repository';
import { StatusReadService } from './status-read-service';

export function createStatusReadService(db: D1Database): StatusReadService {
  const repo = new D1StatusRepository(db);
  return new StatusReadService(repo);
}
