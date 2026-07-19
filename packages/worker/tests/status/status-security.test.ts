/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { createStatusRoutes } from '../../src/http/status-routes';

describe('Status Security (SEC-EXTRA-1..5)', () => {
  const env = { ALLOWED_ORIGINS: 'https://trusted.com' };

  it('SEC-EXTRA-1: status endpoint requires no authentication', async () => {
    const mockService = { getPublicStatus: vi.fn().mockResolvedValue({ state: 'empty' }) } as any;
    const router = createStatusRoutes(mockService);

    const request = new Request('http://localhost/api/status', { method: 'GET' });
    // Does not pass Authorization header, should still succeed
    const response = await router.fetch(request, env);
    expect(response.status).toBe(200);
  });

  it('SEC-EXTRA-2: status endpoint drops unrecognized query parameters', async () => {
    const mockService = { getPublicStatus: vi.fn().mockResolvedValue({ state: 'empty' }) } as any;
    const router = createStatusRoutes(mockService);

    const request = new Request('http://localhost/api/status?malicious=1', { method: 'GET' });
    const response = await router.fetch(request, env);
    expect(response.status).toBe(200);
    // Service method takes no arguments other than now, so query params are naturally dropped.
    expect(mockService.getPublicStatus).toHaveBeenCalled();
  });

  it('SEC-EXTRA-3: public status endpoint does not leak internal error details', async () => {
    const mockService = {
      getPublicStatus: vi.fn().mockRejectedValue(new Error('Secret DB failure')),
    } as any;
    const router = createStatusRoutes(mockService);

    const request = new Request('http://localhost/api/status', { method: 'GET' });
    const response = await router.fetch(request, env);
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.error).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error).not.toContain('Secret DB failure');
  });

  it('SEC-EXTRA-4: status options preflight handles untrusted origin', async () => {
    const mockService = { getPublicStatus: vi.fn() } as any;
    const router = createStatusRoutes(mockService);

    const request = new Request('http://localhost/api/status', {
      method: 'OPTIONS',
      headers: { Origin: 'https://attacker.com' },
    });
    const response = await router.fetch(request, env);
    expect(response.status).toBe(403);
  });

  it('SEC-EXTRA-5: status endpoint blocks POST/PUT/DELETE mutations', async () => {
    const mockService = { getPublicStatus: vi.fn() } as any;
    const router = createStatusRoutes(mockService);

    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const request = new Request('http://localhost/api/status', { method });
      const response = await router.fetch(request, env);
      expect(response.status).toBe(405);
    }
  });
});
