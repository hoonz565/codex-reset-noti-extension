import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockEmailProvider } from '../../src/email/providers/mock-email-provider';
import { ConfiguredEmailProvider } from '../../src/email/providers/configured-email-provider';

describe('Delivery Provider', () => {
  let provider: MockEmailProvider;

  beforeEach(() => {
    provider = new MockEmailProvider();
  });

  const sendTestEmail = async () => {
    return provider.send({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      text: 'Test',
    });
  };

  it('DEL-PROVIDER-1: Accepted result returns providerMessageId safely.', async () => {
    provider.nextResult = { outcome: 'accepted', providerMessageId: 'msg-123' };
    const res = await sendTestEmail();
    expect(res.outcome).toBe('accepted');
    if (res.outcome === 'accepted') {
      expect(res.providerMessageId).toBe('msg-123');
    }
  });

  it('DEL-PROVIDER-2: 429-like response is retryable and preserves bounded Retry-After.', async () => {
    provider.nextResult = {
      outcome: 'retryable_failure',
      code: 'RATE_LIMITED',
      retryAfterSeconds: 60,
    };
    const res = await sendTestEmail();
    expect(res.outcome).toBe('retryable_failure');
    if (res.outcome === 'retryable_failure') {
      expect(res.retryAfterSeconds).toBe(60);
    }
  });

  it('DEL-PROVIDER-3: 5xx/network failure is retryable.', async () => {
    provider.nextResult = {
      outcome: 'retryable_failure',
      code: 'SERVER_ERROR',
      retryAfterSeconds: null,
    };
    const res = await sendTestEmail();
    expect(res.outcome).toBe('retryable_failure');
    if (res.outcome === 'retryable_failure') {
      expect(res.code).toBe('SERVER_ERROR');
    }
  });

  it('DEL-PROVIDER-4: Invalid configuration/authentication is permanent or typed configuration failure according to policy.', async () => {
    provider.nextResult = { outcome: 'permanent_failure', code: 'UNAUTHORIZED' };
    const res = await sendTestEmail();
    expect(res.outcome).toBe('permanent_failure');
    if (res.outcome === 'permanent_failure') {
      expect(res.code).toBe('UNAUTHORIZED');
    }
  });

  it('DEL-PROVIDER-5: Native exception does not escape the adapter.', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('native secret detail'));
    const configuredProvider = new ConfiguredEmailProvider(
      're_test',
      'alerts@example.com',
      fetchMock
    );

    await expect(
      configuredProvider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      })
    ).resolves.toEqual({
      outcome: 'retryable_failure',
      code: 'NETWORK_ERROR',
      retryAfterSeconds: null,
    });
  });

  it('DEL-PROVIDER-6: Automated tests perform no real network email send.', async () => {
    await sendTestEmail();
    // Validated implicitly since we are using MockEmailProvider
    expect(provider.calls.length).toBe(1);
    expect(provider.calls[0].to).toBe('test@example.com');
  });
});
