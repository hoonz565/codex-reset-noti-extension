/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMetricsRoutes } from '../../src/http/metrics-routes';
import { MetricsReadService } from '../../src/metrics/metrics-read-service';

describe('Metrics Security (SEC-EXTRA-6..10)', () => {
  let mockService: vitest.Mocked<MetricsReadService>;
  let router: any;
  const env = { ALLOWED_ORIGINS: 'https://extension.com', ADMIN_API_TOKEN: 'secret123' };

  beforeEach(() => {
    mockService = { getMetrics: vi.fn() } as any;
    router = createMetricsRoutes(() => mockService);
  });

  it('SEC-EXTRA-6: prevents factory creation and db calls when token is invalid', async () => {
    const factory = vi.fn();
    const mockRouter = createMetricsRoutes(factory);
    const request = new Request('http://localhost/api/admin/metrics', {
      headers: { Authorization: 'Bearer invalid' },
    });
    await mockRouter.fetch(request, env);
    expect(factory).not.toHaveBeenCalled();
  });

  it('SEC-EXTRA-7: returns 500 without leaking error details', async () => {
    mockService.getMetrics.mockRejectedValue(new Error('Secret failure'));
    const request = new Request('http://localhost/api/admin/metrics', {
      headers: { Authorization: 'Bearer secret123' },
    });
    const response = await router.fetch(request, env);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('INTERNAL_SERVER_ERROR');
  });

  it('SEC-EXTRA-8: blocks unsupported methods', async () => {
    const request = new Request('http://localhost/api/admin/metrics', { method: 'POST' });
    const response = await router.fetch(request, env);
    expect(response.status).toBe(405);
  });
  it('SEC-EXTRA-9: OPTIONS method returns 204 without leaking info or creating factory', async () => {
    const factory = vi.fn();
    const mockRouter = createMetricsRoutes(factory);
    const request = new Request('http://localhost/api/admin/metrics', { method: 'OPTIONS' });
    const response = await mockRouter.fetch(request, env);
    expect(response.status).toBe(204);
    expect(factory).not.toHaveBeenCalled();
  });

  it('SEC-EXTRA-10: OPTIONS method returns 403 when origin is forbidden', async () => {
    const factory = vi.fn();
    const mockRouter = createMetricsRoutes(factory);
    const request = new Request('http://localhost/api/admin/metrics', {
      method: 'OPTIONS',
      headers: { Origin: 'https://malicious.com' },
    });
    const response = await mockRouter.fetch(request, env);
    expect(response.status).toBe(403);
    expect(factory).not.toHaveBeenCalled();
  });
});
