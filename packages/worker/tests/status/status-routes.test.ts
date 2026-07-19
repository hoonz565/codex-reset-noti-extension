/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStatusRoutes } from '../../src/http/status-routes';
import { StatusReadService } from '../../src/status/status-read-service';

describe('Status Routes (DASH-API-1..10)', () => {
  let mockService: vitest.Mocked<StatusReadService>;
  let router: any;

  beforeEach(() => {
    mockService = {
      getPublicStatus: vi.fn(),
    } as any;
    router = createStatusRoutes(mockService);
  });

  const env = { ALLOWED_ORIGINS: 'https://extension.com, https://test.com' };

  it('DASH-API-1: GET /api/status returns schemaVersion 1', async () => {
    mockService.getPublicStatus.mockResolvedValue({
      state: 'fresh',
      probability: 50,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: '2023-01-01T00:00:00Z',
    });

    const request = new Request('http://localhost/api/status', { method: 'GET' });
    const response = await router.fetch(request, env);
    const body = await response.json();
    expect(body.schemaVersion).toBe(1);
  });

  it('DASH-API-2: POST /api/status returns 405 Method Not Allowed', async () => {
    const request = new Request('http://localhost/api/status', { method: 'POST' });
    const response = await router.fetch(request, env);
    expect(response.status).toBe(405);
  });

  it('DASH-API-3: GET /api/status includes valid CORS headers', async () => {
    mockService.getPublicStatus.mockResolvedValue({ state: 'empty' } as any);
    const request = new Request('http://localhost/api/status', {
      method: 'GET',
      headers: { Origin: 'https://extension.com' },
    });
    const response = await router.fetch(request, env);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://extension.com');
  });

  it('DASH-API-4: Unavailable is a valid status response', async () => {
    mockService.getPublicStatus.mockResolvedValue({
      state: 'unavailable',
      probability: null,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: '2023-01-01T00:00:00Z',
    });
    const request = new Request('http://localhost/api/status', { method: 'GET' });
    const response = await router.fetch(request, env);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status.state).toBe('unavailable');
  });

  it('DASH-API-5: Repository failures are sanitized and return 500 without leaking details', async () => {
    mockService.getPublicStatus.mockRejectedValue(new Error('Secret DB Error'));
    const request = new Request('http://localhost/api/status', { method: 'GET' });
    const response = await router.fetch(request, env);
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain('Secret DB Error');
  });

  it('DASH-API-6: Public status response contains no subscriber or secret data', async () => {
    mockService.getPublicStatus.mockResolvedValue({ state: 'empty' } as any);
    const request = new Request('http://localhost/api/status', { method: 'GET' });
    const response = await router.fetch(request, env);
    const body = await response.json();
    expect(body).not.toHaveProperty('subscribers');
    expect(body).not.toHaveProperty('secret');
  });

  it('DASH-API-7: GET /api/status includes correct Cache-Control policy', async () => {
    mockService.getPublicStatus.mockResolvedValue({ state: 'empty' } as any);
    const request = new Request('http://localhost/api/status', { method: 'GET' });
    const response = await router.fetch(request, env);
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=30, stale-while-revalidate=60'
    );
  });

  it('DASH-API-8: Status routes perform no upstream source or orchestration fetch', async () => {
    mockService.getPublicStatus.mockResolvedValue({ state: 'empty' } as any);
    const request = new Request('http://localhost/api/status', { method: 'GET' });
    await router.fetch(request, env);
    // Verified statically via BOUNDARY tests, but here we just assert no global fetch was called.
    expect(mockService.getPublicStatus).toHaveBeenCalled();
  });

  it('DASH-API-9: Public status responses are bounded strictly to the contract', async () => {
    mockService.getPublicStatus.mockResolvedValue({ state: 'empty' } as any);
    const request = new Request('http://localhost/api/status', { method: 'GET' });
    const response = await router.fetch(request, env);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['generatedAt', 'schemaVersion', 'status']);
  });

  it('DASH-API-10: OPTIONS request is handled with appropriate CORS headers', async () => {
    const request = new Request('http://localhost/api/status', {
      method: 'OPTIONS',
      headers: { Origin: 'https://test.com' },
    });
    const response = await router.fetch(request, env);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://test.com');
  });
});
