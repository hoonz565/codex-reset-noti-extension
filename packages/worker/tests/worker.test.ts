/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import worker from '../src/index';
import { setupTestDb } from './db/test-utils';

import { env as cfEnv } from 'cloudflare:test';

describe('Worker API Spike', () => {
  const env = {
    ALLOWED_ORIGINS: 'chrome-extension://untrusted-client-id,chrome-extension://local-test-id',
    DB: cfEnv.DB as D1Database,
    RATE_LIMIT_SECRET: 'test-secret',
  };
  const allowedOrigin = 'chrome-extension://untrusted-client-id';
  let backgroundPromises: Promise<any>[] = [];
  const ctx = {
    waitUntil: (p: Promise<any>) => {
      backgroundPromises.push(p);
    },
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    if (backgroundPromises.length > 0) {
      await Promise.all(backgroundPromises);
      backgroundPromises = [];
    }
  });

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
    expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false);
    const data = (await res.json()) as any;
    expect(data.schemaVersion).toBe(1);
    expect(data.status.state).toBe('empty');
  });

  it('OPTIONS returns expected CORS headers for allowed extension origin', async () => {
    const res = await worker.fetch(
      request('OPTIONS', '/api/subscriptions', allowedOrigin),
      env,
      ctx
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigin);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it(
    'Allowed origin receives matching Access-Control-Allow-Origin',
    { timeout: 15000 },
    async () => {
      const payload = {
        email: 'cors-check@example.com',
        preferences: { probability70: true, resetAnnounced: true },
      };
      const res = await worker.fetch(
        request('POST', '/api/subscriptions', allowedOrigin, payload),
        env,
        ctx
      );
      expect(res.status).toBe(202);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigin);
    }
  );

  it('Unknown origin is rejected for subscription POST, before body parsing', async () => {
    // forbidden-Origin state-changing requests produce no writes
    const payload = {
      email: 'user-unknown@example.com',
      preferences: { probability70: true, resetAnnounced: true },
    };
    const res = await worker.fetch(
      new Request('http://localhost:8787/api/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.com',
        },
        body: JSON.stringify(payload),
      }),
      env,
      ctx
    );
    expect(res.status).toBe(403);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe('Origin not allowed');
    // Ensure no writes occurred
    const { results } = await env.DB.prepare('SELECT * FROM subscribers WHERE email = ?')
      .bind('user-unknown@example.com')
      .all();
    expect(results.length).toBe(0);
  });

  it('Missing origin is allowed subject to normal policies', async () => {
    const payload = {
      email: 'user-no-origin@example.com',
      preferences: { probability70: true, resetAnnounced: true },
    };
    const res = await worker.fetch(
      new Request('http://localhost:8787/api/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No Origin header — allowed per policy, subject to rate limits
        },
        body: JSON.stringify(payload),
      }),
      env,
      ctx
    );
    expect(res.status).toBe(202);
  });

  it('Allowed origin does not replace management token authorization', async () => {
    // GET /api/subscriptions/manage with allowed origin but no token must return 401
    const res = await worker.fetch(
      request('GET', '/api/subscriptions/manage', allowedOrigin),
      env,
      ctx
    );
    expect(res.status).toBe(401);
  });

  it('BODY-LIMIT-UNICODE: Unicode body whose char count is under limit but byte count exceeds it is rejected', async () => {
    // Each emoji is 4 UTF-8 bytes. 1300 emojis = 5200 bytes > 5000 limit
    // but string length is 1300 chars which is well under 5000 chars
    const emoji = '\u{1F600}'; // 4 bytes per emoji
    const padding = emoji.repeat(1300);
    const body = JSON.stringify({ padding });
    const res = await worker.fetch(
      new Request('http://localhost:8787/api/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No Content-Length — forces body read and byte measurement
        },
        body,
      }),
      env,
      ctx
    );
    expect(res.status).toBe(413);
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
    expect(res.status).toBe(202);
    const data = (await res.json()) as { accepted: boolean };
    expect(data.accepted).toBe(true);
  });

  it('Both alerts false is rejected', async () => {
    const payload = {
      email: 'user-false@example.com',
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
      email: 'user-90@example.com',
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
      email: 'user-completed@example.com',
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
    expect(data.error).toBe('Invalid request body');
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
      email: 'user-huge@example.com',
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
