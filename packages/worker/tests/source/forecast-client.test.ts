import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SourceForecastClient } from '../../src/source/forecast-client';

describe('SourceForecastClient', () => {
  let client: SourceForecastClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    client = new SourceForecastClient({ url: 'https://test.com', timeoutMs: 100 });
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('SRC-CLIENT-1: Valid 200 JSON returns typed raw response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: () =>
        Promise.resolve(JSON.stringify({ forecast: { score: 73, resetAnnounced: false } })),
    });

    const res = await client.fetch(new Date());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.raw.forecast?.score).toBe(73);
    }
  });

  it('SRC-CLIENT-2: Timeout returns NETWORK_TIMEOUT', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        const err = new Error('AbortError');
        err.name = 'AbortError';
        setTimeout(() => reject(err), 50); // simulate abort
      });
    });

    const res = await client.fetch(new Date());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('NETWORK_TIMEOUT');
    }
  });

  it('SRC-CLIENT-3: HTTP 429 returns HTTP_429 and preserves Retry-After', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 429,
      headers: new Headers({ 'Retry-After': '60' }),
    });

    const res = await client.fetch(new Date());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('HTTP_429');
      expect(res.error.retryAfter).toBe(60);
    }
  });

  it('SRC-CLIENT-4: HTTP 404 returns HTTP_4XX', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 404,
      headers: new Headers(),
    });

    const res = await client.fetch(new Date());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('HTTP_4XX');
    }
  });

  it('SRC-CLIENT-5: HTTP 500 returns HTTP_5XX', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 500,
      headers: new Headers(),
    });

    const res = await client.fetch(new Date());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('HTTP_5XX');
    }
  });

  it('SRC-CLIENT-6: Invalid content type returns INVALID_CONTENT_TYPE', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/html' }),
    });

    const res = await client.fetch(new Date());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('INVALID_CONTENT_TYPE');
    }
  });

  it('SRC-CLIENT-7: Invalid JSON returns INVALID_JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: () => Promise.resolve('{"invalid json}'),
    });

    const res = await client.fetch(new Date());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('INVALID_JSON');
    }
  });

  it('SRC-CLIENT-8: Schema mismatch returns SOURCE_SCHEMA_MISMATCH', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify({ forecast: { score: 'not-a-number' } })),
    });

    const res = await client.fetch(new Date());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('SOURCE_SCHEMA_MISMATCH');
    }
  });

  it('SRC-CLIENT-9: Unknown upstream fields are tolerated', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: () =>
        Promise.resolve(
          JSON.stringify({
            forecast: { score: 73, resetAnnounced: false },
            newUnknownField: 'value',
          })
        ),
    });

    const res = await client.fetch(new Date());
    expect(res.ok).toBe(true);
  });

  it('SRC-CLIENT-SIZE-1: Declared Content-Length over the limit is rejected before body parsing', async () => {
    // 6MB is > 5MB default limit
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({
        'Content-Type': 'application/json',
        'Content-Length': (6 * 1024 * 1024).toString(),
      }),
      text: vi.fn().mockRejectedValue(new Error('Should not be called')),
    });

    const res = await client.fetch(new Date());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('RESPONSE_TOO_LARGE');
    }
  });

  it('SRC-CLIENT-SIZE-2: Missing Content-Length with oversized actual UTF-8 body is rejected', async () => {
    // Chinese characters take 3 bytes in UTF-8. 2 million characters = 6MB.
    const bigString = '字'.repeat(2 * 1024 * 1024);
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }), // No content-length
      text: () => Promise.resolve(bigString),
    });

    const res = await client.fetch(new Date());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('RESPONSE_TOO_LARGE');
    }
  });

  it('SRC-CLIENT-SIZE-3: Content-Length below limit but actual body above limit is rejected', async () => {
    // Content-Length says 1MB, but actual body is 6MB
    const bigString = 'a'.repeat(6 * 1024 * 1024);
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({
        'Content-Type': 'application/json',
        'Content-Length': (1024 * 1024).toString(),
      }),
      text: () => Promise.resolve(bigString),
    });

    const res = await client.fetch(new Date());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('RESPONSE_TOO_LARGE');
    }
  });

  it('SRC-CLIENT-SIZE-4: Invalid Content-Length is handled safely according to documented policy', async () => {
    // Invalid Content-Length (negative or non-numeric) is ignored, proceeds to actual body check
    const validJsonStr = JSON.stringify({ forecast: { score: 73, resetAnnounced: false } });
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({
        'Content-Type': 'application/json',
        'Content-Length': '-100', // Invalid
      }),
      text: () => Promise.resolve(validJsonStr),
    });

    const res = await client.fetch(new Date());
    expect(res.ok).toBe(true);
  });
});
