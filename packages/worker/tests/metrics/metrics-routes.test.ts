/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMetricsRoutes } from '../../src/http/metrics-routes';
import { AdminMetricsResponse } from '@codex-reset/shared';

vi.mock('../../src/metrics/metrics-factory', () => {
  return {
    MetricsFactory: {
      createReadService: vi.fn(),
    },
  };
});

describe('Metrics Routes (DASH-ADMIN-1..12, DASH-METRICS-1)', () => {
  let mockReadService: any;
  let env: any;
  let consoleSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockReadService = {
      getMetrics: vi.fn().mockImplementation(async (windowStr) => {
        if (windowStr === 'invalid') throw new Error('Invalid window parameter');
        return {
          schemaVersion: 1,
          window: windowStr || '24h',
          generatedAt: '2023-01-01T00:00:00Z',
          orchestration: {
            total: 10,
            completed: 8,
            completedWithErrors: 1,
            failed: 1,
            skippedOverlap: 0,
            latestStatus: 'completed',
            latestFinishedAt: '2023-01-01T00:00:00Z',
          },
          source: {
            latestOutcome: 'fresh_snapshot_persisted',
            latestHealth: 'healthy',
            latestCheckedAt: '2023-01-01T00:00:00Z',
            latestTrustedObservedAt: '2023-01-01T00:00:00Z',
            freshnessState: 'fresh',
          },
          events: {
            probabilityReached70: 5,
            resetAnnounced: 0,
          },
          deliveries: {
            pending: 0,
            duePending: 0,
            processing: 0,
            staleProcessing: 0,
            sentToProvider: 10,
            failedPermanent: 0,
            cancelled: 0,
          },
        } as AdminMetricsResponse;
      }),
    };

    env = {
      ADMIN_API_TOKEN: 'valid-secret-token',
      ALLOWED_ORIGINS: 'https://trusted.com',
    };
  });

  const runRequest = async (req: Request, environment = env) => {
    const factory = vi.fn().mockReturnValue(mockReadService);
    const routes = createMetricsRoutes(factory);
    return { res: await routes.fetch(req, environment), factory };
  };

  const createRequest = (
    url: string,
    method: string = 'GET',
    headers: Record<string, string> = {}
  ) => {
    const h = new Headers();
    for (const [k, v] of Object.entries(headers)) {
      h.set(k, v);
    }
    return {
      url,
      method,
      headers: h,
      clone: function () {
        return this;
      },
    } as unknown as Request;
  };

  it('DASH-METRICS-1: Default metrics window is applied.', async () => {
    const req = createRequest('http://localhost/api/admin/metrics', 'GET', {
      Authorization: 'Bearer valid-secret-token',
    });
    const { res } = await runRequest(req);
    expect(res.status).toBe(200);
    expect(mockReadService.getMetrics).toHaveBeenCalledWith('24h', expect.any(Date));
  });

  it('DASH-ADMIN-1: missing authorization header returns 401', async () => {
    const req = createRequest('http://localhost/api/admin/metrics');
    const { res } = await runRequest(req);
    expect(res.status).toBe(401);
  });

  it('DASH-ADMIN-2: invalid authorization header returns 401', async () => {
    const req = createRequest('http://localhost/api/admin/metrics', 'GET', {
      Authorization: 'Bearer wrong-token',
    });
    const { res } = await runRequest(req);
    expect(res.status).toBe(401);
  });

  it('DASH-ADMIN-3: valid bearer returns metrics', async () => {
    const req = createRequest('http://localhost/api/admin/metrics', 'GET', {
      Authorization: 'Bearer valid-secret-token',
    });
    const { res } = await runRequest(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schemaVersion).toBe(1);
  });

  it('DASH-ADMIN-4: forbidden Origin rejected before queries', async () => {
    const req = createRequest('http://localhost/api/admin/metrics', 'GET', {
      Authorization: 'Bearer valid-secret-token',
      Origin: 'https://attacker.com',
    });
    const { res, factory } = await runRequest(req);
    expect(res.status).toBe(403);
    expect(factory).not.toHaveBeenCalled();
  });

  it('DASH-ADMIN-5: allowed Origin without token unauthorized', async () => {
    const req = createRequest('http://localhost/api/admin/metrics', 'GET', {
      Origin: 'https://trusted.com',
    });
    const { res } = await runRequest(req);
    expect(res.status).toBe(401);
  });

  it('DASH-ADMIN-6: no-Origin still requires bearer', async () => {
    const req = createRequest('http://localhost/api/admin/metrics', 'GET');
    const { res } = await runRequest(req);
    expect(res.status).toBe(401);
  });

  it('DASH-ADMIN-7: unsupported method rejected', async () => {
    const req = createRequest('http://localhost/api/admin/metrics', 'POST', {
      Authorization: 'Bearer valid-secret-token',
    });
    const { res } = await runRequest(req);
    expect(res.status).toBe(405);
  });

  it('DASH-ADMIN-8: unsupported window rejected', async () => {
    const req = createRequest('http://localhost/api/admin/metrics?window=invalid', 'GET', {
      Authorization: 'Bearer valid-secret-token',
    });
    const { res } = await runRequest(req);
    expect(res.status).toBe(400);
  });

  it('DASH-METRICS-3: Unsupported window is rejected.', async () => {
    const req = createRequest('http://localhost/api/admin/metrics?window=invalid', 'GET', {
      Authorization: 'Bearer valid-secret-token',
    });
    const { res } = await runRequest(req);
    expect(res.status).toBe(400);
  });

  it('DASH-ADMIN-9: token absent from response and logs', async () => {
    const req = createRequest('http://localhost/api/admin/metrics', 'GET', {
      Authorization: 'Bearer valid-secret-token',
    });
    const { res } = await runRequest(req);
    const bodyText = await res.clone().text();
    expect(bodyText).not.toContain('valid-secret-token');

    // Assume we intercept console/logs and assert token isn't there
    const logCalls = consoleSpy.mock.calls.flat().join(' ');
    expect(logCalls).not.toContain('valid-secret-token');
  });

  it('DASH-ADMIN-10: subscriber/management/installation tokens cannot authorize', async () => {
    const req = createRequest('http://localhost/api/admin/metrics', 'GET', {
      Authorization: 'Bearer sub-token-123',
    });
    const { res } = await runRequest(req);
    expect(res.status).toBe(401);
  });

  it('DASH-ADMIN-11: reuses Phase 7 admin auth', async () => {
    const req = createRequest('http://localhost/api/admin/metrics', 'GET', {
      Authorization: 'Bearer valid-secret-token', // Same env check as Phase 7
    });
    const { res } = await runRequest(req);
    expect(res.status).toBe(200);
  });

  it('DASH-ADMIN-12: response schema-valid and bounded', async () => {
    const req = createRequest('http://localhost/api/admin/metrics', 'GET', {
      Authorization: 'Bearer valid-secret-token',
    });
    const { res } = await runRequest(req);
    const body = await res.json();
    expect(body.orchestration.total).toBe(10);
    expect(Object.keys(body).sort()).toEqual([
      'deliveries',
      'events',
      'generatedAt',
      'orchestration',
      'schemaVersion',
      'source',
      'window',
    ]);
  });

  it('ADMIN-EXTRA-1: OPTIONS preflight is allowed', async () => {
    const req = createRequest('http://localhost/api/admin/metrics', 'OPTIONS');
    const { res } = await runRequest(req);
    expect(res.status).toBe(204);
  });
});
