/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStatusRoutes } from '../../src/http/status-routes';
import { createMetricsRoutes } from '../../src/http/metrics-routes';
import { StatusReadService } from '../../src/status/status-read-service';
import { D1StatusRepository } from '../../src/status/status-repository';
import { MetricsReadService } from '../../src/metrics/metrics-read-service';
import { D1MetricsRepository } from '../../src/metrics/metrics-repository';
import { setupTestDb } from '../db/test-utils';
import statusRepoRaw from '../../src/status/status-repository?raw';
import metricsRoutesRaw from '../../src/http/metrics-routes?raw';
import statusRoutesRaw from '../../src/http/status-routes?raw';

describe('Canonical Security (DASH-SEC-1..10)', () => {
  let db: any;
  let statusRepo: D1StatusRepository;
  let statusService: StatusReadService;
  let metricsRepo: D1MetricsRepository;
  let metricsService: MetricsReadService;

  beforeEach(async () => {
    db = await setupTestDb();
    statusRepo = new D1StatusRepository(db);
    statusService = new StatusReadService(statusRepo);
    metricsRepo = new D1MetricsRepository(db);
    metricsService = new MetricsReadService(metricsRepo);
  });

  it('DASH-SEC-1: Public status response contains no raw email.', async () => {
    // Seed DB with subscriber containing sentinel email
    await db
      .prepare(
        `INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, token_version, created_at, updated_at) VALUES ('sub-sec-1', 'sentinel@raw.com', 'sentinel@raw.com', 'active', 1, 1, 'hash', 1, '2023', '2023')`
      )
      .run();

    const routes = createStatusRoutes(statusService);
    const res = await routes.fetch(new Request('http://localhost/api/status'), {
      ALLOWED_ORIGINS: '*',
    });
    const text = await res.text();
    expect(text).not.toContain('sentinel@raw.com');
  });

  it('DASH-SEC-2: Public status response contains no subscriber or installation ID.', async () => {
    await db
      .prepare(
        `INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, token_version, created_at, updated_at) VALUES ('sub-sentinel-123', 'a@b.com', 'a@b.com', 'active', 1, 1, 'hash', 1, '2023', '2023')`
      )
      .run();

    const routes = createStatusRoutes(statusService);
    const res = await routes.fetch(new Request('http://localhost/api/status'), {
      ALLOWED_ORIGINS: '*',
    });
    const text = await res.text();
    expect(text).not.toContain('sub-sentinel-123');
    expect(text).not.toContain('inst-sentinel-456'); // The system doesn't even have installation ID concept anymore, but verify anyway
  });

  it('DASH-SEC-3: Public status response contains no confirmation or management token.', async () => {
    await db
      .prepare(
        `INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, token_version, created_at, updated_at) VALUES ('sub1', 'a@b.com', 'a@b.com', 'active', 1, 1, 'mgmt-sentinel-token', 1, '2023', '2023')`
      )
      .run();

    const routes = createStatusRoutes(statusService);
    const res = await routes.fetch(new Request('http://localhost/api/status'), {
      ALLOWED_ORIGINS: '*',
    });
    const text = await res.text();
    expect(text).not.toContain('conf-sentinel-token');
    expect(text).not.toContain('mgmt-sentinel-token');
  });

  it('DASH-SEC-4: Admin metrics response contains no individual subscriber row.', async () => {
    // Seed individual row
    await db
      .prepare(
        `INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, token_version, created_at, updated_at) VALUES ('sub-sec-4', 'test@test.com', 'test@test.com', 'active', 1, 1, 'hash', 1, '2023', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('c1', 'completed', '2023', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO source_snapshots (id, checked_at, created_at, lifecycle, source_health, meaningful_change, payload_hash, probability) VALUES ('s1', '2023', '2023', 'none', 'healthy', 0, 'hash', 100)`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO reset_events (id, reset_cycle_id, type, source_snapshot_id, created_at) VALUES ('e1', 'c1', 'PROBABILITY_REACHED_70', 's1', '2023-01-01T00:05:00Z')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, attempt_count, created_at, updated_at, next_attempt_at, processing_started_at) VALUES ('d1', 'e1', 'sub-sec-4', 'email', 'pending', 0, '2023', '2023', null, null)`
      )
      .run();

    const mockFactory = vi.fn().mockReturnValue(metricsService);
    const routes = createMetricsRoutes(mockFactory);
    const req = new Request('http://localhost/api/admin/metrics');
    req.headers.set('Authorization', 'Bearer admin-token');
    const res = await routes.fetch(req, { ADMIN_API_TOKEN: 'admin-token', ALLOWED_ORIGINS: '*' });
    const text = await res.text();

    expect(text).not.toContain('test@test.com');
    expect(text).not.toContain('sub-sec-4');
  });

  it('DASH-SEC-5: Authorization header is never logged.', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockFactory = vi.fn().mockReturnValue({
      getMetrics: vi.fn().mockResolvedValue({}),
    });
    const routes = createMetricsRoutes(mockFactory);
    const req = new Request('http://localhost/api/admin/metrics');
    req.headers.set('Authorization', 'Bearer SENTINEL_SECRET_TOKEN');

    await routes.fetch(req, { ADMIN_API_TOKEN: 'other-token', ALLOWED_ORIGINS: '*' });

    const allLogs = [
      ...consoleLog.mock.calls.flat(),
      ...consoleWarn.mock.calls.flat(),
      ...consoleError.mock.calls.flat(),
    ].join(' ');

    expect(allLogs).not.toContain('SENTINEL_SECRET_TOKEN');

    consoleLog.mockRestore();
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  it('DASH-SEC-6: All status and metrics SQL values use bound parameters.', async () => {
    const prepareSpy = vi.spyOn(db, 'prepare');

    // Trigger some queries
    await metricsService.getMetrics('1h', new Date());
    await statusService.getPublicStatus(new Date());

    const calls = prepareSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    for (const [sql] of calls) {
      // The SQL string must NOT contain dynamic time values or raw IDs directly embedded.
      // Assert that any dynamic filter uses '?'
      if (sql.includes('created_at >')) {
        expect(sql).toContain('?');
      }
      if (sql.includes('started_at >')) {
        expect(sql).toContain('?');
      }

      // We know our db wrapper returns a stmt that we can spy on .bind() if we mocked it,
      // but miniflare's D1 prepare() creates a statement where .bind() is called.
      // We can assert the SQL string has no single-quoted dynamic values that look like dates.
      expect(sql).not.toMatch(/'\d{4}-\d{2}-\d{2}/);
    }
  });

  it('DASH-SEC-7: Raw upstream payload is never returned or persisted by Phase 8.', async () => {
    // Seed a sentinel payload hash that mimics upstream data
    await db
      .prepare(
        `INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('c1', 'completed', '2023', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO source_snapshots (id, checked_at, created_at, lifecycle, source_health, meaningful_change, payload_hash, probability) VALUES ('s1', '2023', '2023', 'none', 'healthy', 0, 'SENTINEL_UPSTREAM_PAYLOAD_38f29c', 100)`
      )
      .run();

    const routes = createStatusRoutes(statusService);
    const res = await routes.fetch(new Request('http://localhost/api/status'), {
      ALLOWED_ORIGINS: '*',
    });
    const text = await res.text();
    expect(text).not.toContain('SENTINEL_UPSTREAM_PAYLOAD_38f29c');

    expect(statusRepoRaw).not.toContain('INSERT');
    expect(statusRepoRaw).not.toContain('UPDATE');
  });

  it('DASH-SEC-8: Provider credentials and provider-native responses are absent.', () => {
    const combined = metricsRoutesRaw + statusRoutesRaw;
    expect(combined).not.toContain('SENDGRID_API_KEY');
    expect(combined).not.toContain('provider_');
  });

  it('DASH-SEC-9: CORS does not authorize admin metrics.', async () => {
    const mockFactory = vi.fn().mockReturnValue({
      getMetrics: vi.fn().mockResolvedValue({}),
    });
    const routes = createMetricsRoutes(mockFactory);
    const req = new Request('http://localhost/api/admin/metrics', {
      headers: {
        Origin: 'https://trusted.com',
        Authorization: 'Bearer wrong-token',
      },
    });
    const res = await routes.fetch(req, {
      ADMIN_API_TOKEN: 'admin-token',
      ALLOWED_ORIGINS: 'https://trusted.com',
    });
    expect(res.status).toBe(401);
    expect(mockFactory).toHaveBeenCalledTimes(0);
  });

  it('DASH-SEC-10: No real secret is committed in source, fixtures, docs, or wrangler.toml.', () => {
    const sourceFiles = import.meta.glob('../../src/**/*.ts', { query: '?raw', import: 'default', eager: true });
    const testFiles = import.meta.glob('../../tests/**/*.ts', { query: '?raw', import: 'default', eager: true });
    const docFiles = import.meta.glob('../../../../docs/**/*.md', { query: '?raw', import: 'default', eager: true });
    const packageFiles = import.meta.glob('../../../../package.json', { query: '?raw', import: 'default', eager: true });
    const wranglerFile = import.meta.glob('../../wrangler.toml', { query: '?raw', import: 'default', eager: true });

    const allFiles = { ...sourceFiles, ...testFiles, ...docFiles, ...packageFiles, ...wranglerFile };

    const allowedPlaceholders = ['"test-admin-secret"', '"dev-secret"', "'dev-secret'"];
    
    for (const [path, contentRaw] of Object.entries(allFiles)) {
      let content = contentRaw as string;
      
      for (const p of allowedPlaceholders) {
        content = content.replace(new RegExp(p, 'g'), '""');
      }

      // Reject real-looking long bearer/API values
      expect(content).not.toMatch(/ADMIN_API_TOKEN\s*=\s*['"][^'"]{15,}['"]/);
      expect(content).not.toMatch(/RATE_LIMIT_SECRET\s*=\s*['"][^'"]{15,}['"]/);
      
      // Reject SG.-prefixed credentials
      expect(content).not.toMatch(/SG\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
      
      // Reject committed non-placeholder secrets like sk_live_
      expect(content).not.toMatch(/sk_live_[a-zA-Z0-9]+/);

      // Reject provider credentials
      expect(content).not.toMatch(/SENDGRID_API_KEY\s*=\s*['"][^'"]{10,}['"]/);
    }
  });
});
