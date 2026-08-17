import { describe, it, expect, vi } from 'vitest';
import { setupTestDb } from '../db/test-utils';
import { createStatusReadService } from '../../src/status/status-factory';
import { createMetricsReadService } from '../../src/metrics/metrics-factory';
import { createStatusRoutes } from '../../src/http/status-routes';
import { createMetricsRoutes } from '../../src/http/metrics-routes';

describe('Status Boundary (SEC-BOUNDARY-1..10)', () => {
  it('SEC-BOUNDARY-1: prevents write operations (INSERT) in status/metrics source files', async () => {
    const modules = import.meta.glob(['../../src/status/**/*.ts', '../../src/metrics/**/*.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    });

    for (const [_path, content] of Object.entries(modules)) {
      if (typeof content !== 'string') continue; // Shouldn't happen with as: 'raw'

      expect(content).not.toMatch(/INSERT INTO/i);
      expect(content).not.toMatch(/UPDATE\s+\w+\s+SET/i);
      expect(content).not.toMatch(/DELETE FROM/i);
    }
  });

  it('SEC-BOUNDARY-2: prevents HTTP calls (fetch) in status/metrics source files', async () => {
    const modules = import.meta.glob(['../../src/status/**/*.ts', '../../src/metrics/**/*.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    });

    for (const [_path, content] of Object.entries(modules)) {
      if (typeof content !== 'string') continue;

      expect(content).not.toMatch(/\Wfetch\(/);
    }
  });

  it('SEC-BOUNDARY-3: prevents importing email providers or webhooks', async () => {
    const modules = import.meta.glob(['../../src/status/**/*.ts', '../../src/metrics/**/*.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    });

    for (const [_path, content] of Object.entries(modules)) {
      if (typeof content !== 'string') continue;

      expect(content).not.toMatch(/email\/providers/);
      expect(content).not.toMatch(/orchestration\/runner/);
      expect(content).not.toMatch(/delivery/); // no delivery mutations
    }
  });

  it('SEC-BOUNDARY-4: prevents mutation dependencies via injection', () => {
    expect(createStatusReadService.length).toBe(1);
    expect(createMetricsReadService.length).toBe(1);
  });
  it('SEC-BOUNDARY-5: read service executes ONLY SELECT queries', async () => {
    const db = await setupTestDb();
    const prepareSpy = vi.spyOn(db, 'prepare');
    prepareSpy.mockClear();
    await createStatusReadService(db).getPublicStatus(new Date('2026-07-18T12:00:00Z'));

    const statements = prepareSpy.mock.calls.map(([sql]) => String(sql).trim());
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.filter((sql) => !/^(SELECT|WITH|PRAGMA)\b/i.test(sql))).toEqual([]);
    prepareSpy.mockRestore();
  });

  it('SEC-BOUNDARY-6: read service does not invoke fetch internally', async () => {
    const db = await setupTestDb();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await createStatusReadService(db).getPublicStatus(new Date('2026-07-18T12:00:00Z'));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('SEC-BOUNDARY-7: read service does not schedule alarms', () => {
    const modules = import.meta.glob(['../../src/status/**/*.ts', '../../src/metrics/**/*.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    const source = Object.values(modules).join('\n');
    expect(source).not.toMatch(/setAlarm|scheduled\s*\(|ctx\.waitUntil/);
  });

  it('SEC-BOUNDARY-8: metrics read service executes ONLY SELECT queries', async () => {
    const db = await setupTestDb();
    const prepareSpy = vi.spyOn(db, 'prepare');
    prepareSpy.mockClear();
    await createMetricsReadService(db).getMetrics('24h', new Date('2026-07-18T12:00:00Z'));

    const statements = prepareSpy.mock.calls.map(([sql]) => String(sql).trim());
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.filter((sql) => !/^(SELECT|WITH|PRAGMA)\b/i.test(sql))).toEqual([]);
    prepareSpy.mockRestore();
  });

  it('SEC-BOUNDARY-9: metrics read service does not mutate runs or cycles', async () => {
    const db = await setupTestDb();
    const before = await db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM orchestration_runs) AS runs, (SELECT COUNT(*) FROM reset_cycles) AS cycles'
      )
      .first<{ runs: number; cycles: number }>();
    await createMetricsReadService(db).getMetrics('24h', new Date('2026-07-18T12:00:00Z'));
    const after = await db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM orchestration_runs) AS runs, (SELECT COUNT(*) FROM reset_cycles) AS cycles'
      )
      .first<{ runs: number; cycles: number }>();
    expect(after).toEqual(before);
  });

  it('SEC-BOUNDARY-10: routes do not catch internal errors to leak them', async () => {
    const internalDetail = 'sensitive-database-path-and-secret';
    const statusRouter = createStatusRoutes({
      getPublicStatus: vi.fn().mockRejectedValue(new Error(internalDetail)),
    } as never);
    const metricsRouter = createMetricsRoutes(() => ({
      getMetrics: vi.fn().mockRejectedValue(new Error(internalDetail)),
    }));
    const env = { ALLOWED_ORIGINS: '', ADMIN_API_TOKEN: 'admin-token' };

    const statusResponse = await statusRouter.fetch(
      new Request('https://worker.example/api/status'),
      env
    );
    const metricsResponse = await metricsRouter.fetch(
      new Request('https://worker.example/api/admin/metrics', {
        headers: { Authorization: 'Bearer admin-token' },
      }),
      env
    );
    expect(statusResponse.status).toBe(500);
    expect(metricsResponse.status).toBe(500);
    expect(await statusResponse.text()).not.toContain(internalDetail);
    expect(await metricsResponse.text()).not.toContain(internalDetail);
  });
});
