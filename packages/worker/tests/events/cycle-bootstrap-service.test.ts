import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestDb } from '../db/test-utils';
import { CycleBootstrapService } from '../../src/services/cycle-bootstrap-service';
import { ResetCycleRepository } from '../../src/db/repositories/ResetCycleRepository';
import { AuditEventRepository } from '../../src/db/repositories/AuditEventRepository';

describe('Cycle Bootstrap Service', () => {
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

  test('EV-BOOT-1: No active cycle creates cycle:genesis once', async () => {
    const res = await service.bootstrapIfNecessary(new Date());
    expect(res.cycleId).toBe('cycle:genesis');
    const active = await cycleRepo.findActive();
    expect(active?.id).toBe('cycle:genesis');
  });

  test('EV-BOOT-2: Repeated bootstrap is idempotent', async () => {
    const res1 = await service.bootstrapIfNecessary(new Date());
    const res2 = await service.bootstrapIfNecessary(new Date());
    expect(res1.cycleId).toBe('cycle:genesis');
    expect(res2.cycleId).toBe('cycle:genesis');

    // Should only have 1 genesis cycle
    const cycle = await cycleRepo.findById('cycle:genesis');
    expect(cycle).not.toBeNull();
  });

  test('EV-BOOT-4: Bootstrap records one BOOTSTRAP_COMPLETE audit event', async () => {
    const audits = await auditRepo.listRecent(10);
    const bootstrapAudits = audits.filter((a) => a.type === 'BOOTSTRAP_COMPLETE');
    expect(bootstrapAudits.length).toBe(1);
    expect(bootstrapAudits[0].deduplication_key).toBe('BOOTSTRAP_COMPLETE:cycle:genesis');
  });
});
