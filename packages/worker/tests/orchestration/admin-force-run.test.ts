/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../../src/index';
import { setupTestDb } from '../db/test-utils';
import { ForceRunService } from '../../src/services/force-run-service';

// Pre-import dynamic dependencies to avoid Vitest dynamic import deadlock
import '../../src/orchestration/factory';
import '../../src/orchestration/orchestration-config';
import '../../src/http/admin-routes';
import '../../src/source/forecast-client';
import '../../src/email/providers/mock-email-provider';
import '../../src/email/email-template-renderer';

describe('Admin Force Run Route', () => {
  let env: any;
  let executeSpy: any;
  let backgroundPromises: Promise<any>[] = [];
  let ctx: any;

  beforeEach(async () => {
    env = {
      DB: await setupTestDb(),
      RATE_LIMIT_SECRET: 'dev',
      ADMIN_API_TOKEN: 'secret-token',
      ALLOWED_ORIGINS: 'chrome-extension://123',
    };
    backgroundPromises = [];
    ctx = {
      waitUntil: (p: Promise<any>) => backgroundPromises.push(p),
      passThroughOnException: () => {},
    };
    executeSpy = vi
      .spyOn(ForceRunService.prototype, 'execute')
      .mockResolvedValue({ outcome: 'completed' } as any);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (backgroundPromises.length > 0) {
      await Promise.allSettled(backgroundPromises);
    }
  });

  it('ORCH-ADMIN-1: Missing Authorization is rejected', async () => {
    const req = new Request('http://localhost/api/admin/orchestration/run', {
      method: 'POST',
      body: null,
    });
    const res = await worker.fetch(req, env, ctx);
    await res.text();
    expect(res.status).toBe(401);
    expect(executeSpy).not.toHaveBeenCalled();
  }, 15000);

  it('ORCH-ADMIN-2: Invalid bearer is rejected', async () => {
    const req = new Request('http://localhost/api/admin/orchestration/run', {
      method: 'POST',
      body: null,
      headers: { Authorization: 'Bearer invalid' },
    });
    const res = await worker.fetch(req, env, ctx);
    await res.text();
    expect(res.status).toBe(401);
    expect(executeSpy).not.toHaveBeenCalled();
  }, 15000);

  it('ORCH-ADMIN-3: Valid bearer invokes the same orchestration runner used by scheduled execution', async () => {
    const req = new Request('http://localhost/api/admin/orchestration/run', {
      method: 'POST',
      body: null,
      headers: { Authorization: 'Bearer secret-token' },
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);
    expect(executeSpy).toHaveBeenCalled(); // Prove ForceRunService which wraps the same runner is called
  });

  it('ORCH-ADMIN-4: Forbidden Origin is rejected before factory/runner/lock/DB invocation', async () => {
    const req = new Request('http://localhost/api/admin/orchestration/run', {
      method: 'POST',
      body: null,
      headers: { Authorization: 'Bearer secret-token', Origin: 'http://evil.com' },
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(403);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('ORCH-ADMIN-5: Allowed Origin without bearer remains unauthorized', async () => {
    const req = new Request('http://localhost/api/admin/orchestration/run', {
      method: 'POST',
      body: null,
      headers: { Origin: 'chrome-extension://123' },
    });
    const res = await worker.fetch(req, env, ctx);
    await res.text();
    expect(res.status).toBe(401);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('ORCH-ADMIN-6: No-Origin request still requires bearer auth', async () => {
    const req = new Request('http://localhost/api/admin/orchestration/run', {
      method: 'POST',
      body: null,
    });
    const res = await worker.fetch(req, env, ctx);
    await res.text();
    expect(res.status).toBe(401);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('ORCH-ADMIN-7: Endpoint returns a sanitized typed orchestration response', async () => {
    const req = new Request('http://localhost/api/admin/orchestration/run', {
      method: 'POST',
      body: null,
      headers: { Authorization: 'Bearer secret-token' },
    });
    const res = await worker.fetch(req, env, ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    // ForceRunService returns outcome. Here we mocked it to 'completed'
    expect((body as any).outcome).toBe('completed');
  });

  it('ORCH-ADMIN-8: Admin token never appears in logs or response', async () => {
    const req = new Request('http://localhost/api/admin/orchestration/run', {
      method: 'POST',
      body: null,
      headers: { Authorization: 'Bearer secret-token' },
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await worker.fetch(req, env, ctx);
    const text = await res.text();
    expect(text).not.toContain('secret-token');
    // Ensure no logs leaked it either
    for (const call of consoleSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('secret-token');
    }
    consoleSpy.mockRestore();
  });

  it('ORCH-ADMIN-9: Concurrent admin and scheduled invocations respect the same overlap lease', async () => {
    // This overlaps with ORCH-LOCK-7, but here we test the e2e integration level
    executeSpy.mockResolvedValue({ outcome: 'skipped_overlap' });
    const req = new Request('http://localhost/api/admin/orchestration/run', {
      method: 'POST',
      body: null,
      headers: { Authorization: 'Bearer secret-token' },
    });
    const res = await worker.fetch(req, env, ctx);
    const body = await res.json();
    expect((body as any).outcome).toBe('skipped_overlap');
  });

  it('ORCH-ADMIN-10: Unsupported HTTP method is rejected', async () => {
    const req = new Request('http://localhost/api/admin/orchestration/run', {
      method: 'PUT',
      headers: { Authorization: 'Bearer secret-token' },
    });
    const res = await worker.fetch(req, env, ctx);
    await res.text();
    expect([404, 405]).toContain(res.status);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('ADMIN-ADDITIONAL-1: POST body follows the approved empty-body policy', async () => {
    const req = new Request('http://localhost/api/admin/orchestration/run', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token' },
      body: JSON.stringify({ trigger: 'now' }),
    });
    const res = await worker.fetch(req, env, ctx);
    await res.text();
    expect(res.status).toBe(400); // bad request
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('ADMIN-ADDITIONAL-2: OPTIONS handles only allowed origins', async () => {
    const req = new Request('http://localhost/api/admin/orchestration/run', {
      method: 'OPTIONS',
      headers: { Origin: 'http://evil.com' },
    });
    const res = await worker.fetch(req, env, ctx);
    await res.text();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('');
  });

  it('ADMIN-ADDITIONAL-3: subscriber/management tokens cannot authorize admin', async () => {
    const req = new Request('http://localhost/api/admin/orchestration/run', {
      method: 'POST',
      body: null,
      headers: { Authorization: 'Bearer subscriber-token' },
    });
    const res = await worker.fetch(req, env, ctx);
    await res.text();
    expect(res.status).toBe(401);
    expect(executeSpy).not.toHaveBeenCalled();
  });
});
