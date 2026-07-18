import { describe, it, expect } from 'vitest';
import worker from '../src/index';

describe('Worker API Spike', () => {
  const env = { ALLOWED_ORIGINS: 'chrome-extension://untrusted-client-id,chrome-extension://local-test-id' };
  const allowedOrigin = 'chrome-extension://untrusted-client-id';
  const ctx = {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;

  const request = (method: string, path: string, origin?: string, body?: unknown) => {
    const headers = new Headers();
    if (origin) headers.set('Origin', origin);
    const init: RequestInit = { method, headers };
    if (body) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
      headers.set('Content-Type', 'application/json');
    }
    return new Request(`http://localhost${path}`, init);
  };

  it('GET /api/status returns a valid normal response', async () => {
    const res = await worker.fetch(request('GET', '/api/status'), env, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const data = (await res.json()) as {
      ok: boolean;
      sourceHealth: string;
      status: { schemaVersion: number; probability: number } | null;
    };
    expect(data.ok).toBe(true);
    expect(data.sourceHealth).toBe('healthy');
    expect(data.status?.schemaVersion).toBe(1);
    expect(data.status?.probability).toBe(73);
  });

  it('Cold-start mode returns status=null and validates', async () => {
    const res = await worker.fetch(request('GET', '/api/status?coldStart=true'), env, ctx);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: unknown; sourceHealth: string };
    expect(data.status).toBeNull();
    expect(data.sourceHealth).toBe('unavailable');
  });

  it('OPTIONS returns expected CORS headers for allowed extension origin', async () => {
    const res = await worker.fetch(request('OPTIONS', '/api/subscriptions', allowedOrigin), env, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigin);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('Allowed origin receives matching Access-Control-Allow-Origin', async () => {
    const payload = {
      email: 'user@example.com',
      preferences: { probability70: true, resetAnnounced: true },
    };
    const res = await worker.fetch(
      request('POST', '/api/subscriptions', allowedOrigin, payload),
      env,
      ctx
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigin);
  });

  it('Unknown origin is rejected for subscription POST', async () => {
    const payload = {
      email: 'user@example.com',
      preferences: { probability70: true, resetAnnounced: true },
    };
    const res = await worker.fetch(
      request('POST', '/api/subscriptions', 'https://evil.com', payload),
      env,
      ctx
    );
    expect(res.status).toBe(403);
  });

  it('POST valid two-alert payload succeeds', async () => {
    const payload = {
      email: 'user@example.com',
      preferences: { probability70: true, resetAnnounced: true },
    };
    const res = await worker.fetch(
      request('POST', '/api/subscriptions', allowedOrigin, payload),
      env,
      ctx
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; subscription: { id: string } };
    expect(data.ok).toBe(true);
    expect(data.subscription.id).toBe('sub_transport_spike');
  });

  it('Both alerts false is rejected', async () => {
    const payload = {
      email: 'user@example.com',
      preferences: { probability70: false, resetAnnounced: false },
    };
    const res = await worker.fetch(
      request('POST', '/api/subscriptions', allowedOrigin, payload),
      env,
      ctx
    );
    expect(res.status).toBe(400);
  });

  it('probability90 is rejected', async () => {
    const payload = {
      email: 'user@example.com',
      preferences: { probability70: true, resetAnnounced: true, probability90: true },
    };
    const res = await worker.fetch(
      request('POST', '/api/subscriptions', allowedOrigin, payload),
      env,
      ctx
    );
    expect(res.status).toBe(400);
  });

  it('resetCompleted is rejected', async () => {
    const payload = {
      email: 'user@example.com',
      preferences: { probability70: true, resetAnnounced: true, resetCompleted: true },
    };
    const res = await worker.fetch(
      request('POST', '/api/subscriptions', allowedOrigin, payload),
      env,
      ctx
    );
    expect(res.status).toBe(400);
  });

  it('BODY-LIMIT-3: Small invalid JSON returns 400 rather than 413', async () => {
    const res = await worker.fetch(
      request('POST', '/api/subscriptions', allowedOrigin, '{ invalid'),
      env,
      ctx
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; details: unknown };
    expect(data.error).toBe('Validation error');
    expect(data.details).not.toBeNull();
  });

  it('BODY-LIMIT-1: Oversized Content-Length is rejected before request.json parsing', async () => {
    const req = request('POST', '/api/subscriptions', allowedOrigin, '{}');
    // Override headers to mock a large content length
    req.headers.set('Content-Length', '9999');
    
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(413);
  });

  it('BODY-LIMIT-2: Missing Content-Length with oversized actual body is rejected after byte measurement', async () => {
    const hugeBody = {
      email: 'user@example.com',
      preferences: { probability70: true, resetAnnounced: true },
      padding: 'x'.repeat(6000),
    };
    const req = request('POST', '/api/subscriptions', allowedOrigin, JSON.stringify(hugeBody));
    // Remove content length to force reading the body
    req.headers.delete('Content-Length');

    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(413);
  });

  it('BODY-LIMIT-4: No response contains a stack trace', async () => {
    const payload = {
      email: 'invalid',
      preferences: { probability70: true, resetAnnounced: true },
    };
    const res = await worker.fetch(
      request('POST', '/api/subscriptions', allowedOrigin, payload),
      env,
      ctx
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    const str = JSON.stringify(data);
    expect(str).not.toContain('Error:');
    expect(str).not.toContain('stack');
  });
});
