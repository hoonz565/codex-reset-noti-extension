import { describe, expect, it, vi } from 'vitest';
import { ConfiguredEmailProvider } from '../../src/email/providers/configured-email-provider';

const email = {
  to: 'recipient@example.com',
  subject: 'Reset alert',
  html: '<p>Reset alert</p>',
  text: 'Reset alert',
  idempotencyKey: 'delivery-123',
};

describe('ConfiguredEmailProvider (Resend)', () => {
  it('rejects incomplete production configuration before any request', () => {
    expect(() => new ConfiguredEmailProvider('', 'alerts@example.com')).toThrow(
      'EMAIL_PROVIDER_API_KEY'
    );
    expect(() => new ConfiguredEmailProvider('re_test', '')).toThrow('EMAIL_FROM_ADDRESS');
  });

  it('sends the documented Resend request with a delivery idempotency key', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const provider = new ConfiguredEmailProvider(
      're_secret_sentinel',
      'Codex Alerts <alerts@example.com>',
      fetchMock
    );

    await expect(provider.send(email)).resolves.toEqual({
      outcome: 'accepted',
      providerMessageId: 'email-123',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer re_secret_sentinel');
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('delivery-123');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      from: 'Codex Alerts <alerts@example.com>',
      to: ['recipient@example.com'],
      subject: 'Reset alert',
      html: '<p>Reset alert</p>',
      text: 'Reset alert',
    });
  });

  it('maps rate limits to bounded retryable failures', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ name: 'rate_limit_exceeded' }), {
        status: 429,
        headers: { 'Retry-After': '120' },
      })
    );
    const provider = new ConfiguredEmailProvider('re_test', 'alerts@example.com', fetchMock);

    await expect(provider.send(email)).resolves.toEqual({
      outcome: 'retryable_failure',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfterSeconds: 120,
    });
  });

  it('maps provider and network failures without leaking native exceptions', async () => {
    const serverFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ type: 'internal_server_error' }), { status: 503 })
      );
    const permanentFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ name: 'invalid_from_address' }), { status: 422 })
      );
    const networkFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('secret network detail'));

    await expect(
      new ConfiguredEmailProvider('re_test', 'alerts@example.com', serverFetch).send(email)
    ).resolves.toEqual({
      outcome: 'retryable_failure',
      code: 'INTERNAL_SERVER_ERROR',
      retryAfterSeconds: null,
    });
    await expect(
      new ConfiguredEmailProvider('re_test', 'alerts@example.com', permanentFetch).send(email)
    ).resolves.toEqual({ outcome: 'permanent_failure', code: 'INVALID_FROM_ADDRESS' });
    await expect(
      new ConfiguredEmailProvider('re_test', 'alerts@example.com', networkFetch).send(email)
    ).resolves.toEqual({
      outcome: 'retryable_failure',
      code: 'NETWORK_ERROR',
      retryAfterSeconds: null,
    });
  });

  it('treats a malformed success response as retryable', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    const provider = new ConfiguredEmailProvider('re_test', 'alerts@example.com', fetchMock);

    await expect(provider.send(email)).resolves.toEqual({
      outcome: 'retryable_failure',
      code: 'INVALID_PROVIDER_RESPONSE',
      retryAfterSeconds: null,
    });
  });
});
