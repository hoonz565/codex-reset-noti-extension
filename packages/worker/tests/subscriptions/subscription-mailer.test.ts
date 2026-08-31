import { describe, expect, it } from 'vitest';
import { MockEmailProvider } from '../../src/email/providers/mock-email-provider';
import { SubscriptionEmailRenderer } from '../../src/email/subscription-email-renderer';
import { SubscriptionMailer } from '../../src/services/subscription-mailer';

describe('SubscriptionMailer', () => {
  it('sends an encoded confirmation link without exposing the token outside message content', async () => {
    const provider = new MockEmailProvider();
    const mailer = new SubscriptionMailer(
      provider,
      new SubscriptionEmailRenderer('https://notify.example/manage')
    );

    await mailer.sendConfirmation('person@example.com', 'raw+/token_value');

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].to).toBe('person@example.com');
    expect(provider.calls[0].text).toContain(
      'https://notify.example/confirm?token=raw%2B%2Ftoken_value'
    );
    expect(provider.calls[0].idempotencyKey).toBeUndefined();
  });

  it('sends secure management links', async () => {
    const provider = new MockEmailProvider();
    const mailer = new SubscriptionMailer(
      provider,
      new SubscriptionEmailRenderer('https://notify.example/manage')
    );

    await mailer.sendManagementLink('person@example.com', 'management-token');

    expect(provider.calls[0].subject).toContain('Manage');
    expect(provider.calls[0].html).toContain(
      'https://notify.example/manage?token=management-token'
    );
  });

  it('returns a sanitized 503 when the provider cannot accept the email', async () => {
    const provider = new MockEmailProvider();
    provider.nextResult = {
      outcome: 'retryable_failure',
      code: 'provider_internal_detail',
      retryAfterSeconds: 10,
    };
    const mailer = new SubscriptionMailer(
      provider,
      new SubscriptionEmailRenderer('https://notify.example/manage')
    );

    await expect(mailer.sendConfirmation('person@example.com', 'token')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      statusCode: 503,
    });
  });
});
