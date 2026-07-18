import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestDb } from '../db/test-utils';
import { CycleBootstrapService } from '../../src/services/cycle-bootstrap-service';
import { ResetCycleRepository } from '../../src/db/repositories/ResetCycleRepository';
import { AuditEventRepository } from '../../src/db/repositories/AuditEventRepository';

describe('Phase 4 Specific Mappings', () => {
  let db: D1Database;
  let cycleRepo: ResetCycleRepository;
  let auditRepo: AuditEventRepository;
  let service: CycleBootstrapService;

  beforeAll(async () => {
    db = await setupTestDb();
    cycleRepo = new ResetCycleRepository(db);
    auditRepo = new AuditEventRepository(db);
    service = new CycleBootstrapService(cycleRepo, auditRepo);
  });

  test('EV-BOOT-3: Two concurrent bootstrap calls create exactly one active cycle:genesis and exactly one BOOTSTRAP_COMPLETE audit event', async () => {
    // Run two bootstrap calls concurrently
    const [res1, res2] = await Promise.all([
      service.bootstrapIfNecessary(new Date()),
      service.bootstrapIfNecessary(new Date()),
    ]);

    const results = [res1.result, res2.result];
    expect(results).toContain('created');
    expect(results).toContain('already_exists');

    const audits = await db
      .prepare('SELECT * FROM audit_events WHERE deduplication_key = ?')
      .bind('BOOTSTRAP_COMPLETE:cycle:genesis')
      .all();
    expect(audits.results.length).toBe(1);

    const cycle = await cycleRepo.findById('cycle:genesis');
    expect(cycle).toBeTruthy();
  });
});
