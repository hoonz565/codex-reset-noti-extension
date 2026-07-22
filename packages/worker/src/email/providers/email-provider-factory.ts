import { EmailProvider } from '../email-types';
import { MockEmailProvider } from './mock-email-provider';
import { DisabledEmailProvider } from './disabled-email-provider';
import { ConfiguredEmailProvider } from './configured-email-provider';

export function createEmailProvider(
  environment: string,
  mailgunApiKey?: string,
  mailgunDomain?: string
): EmailProvider {
  if (environment === 'production') {
    if (!mailgunApiKey || !mailgunDomain) {
      throw new Error('Production environment requires MAILGUN_API_KEY and MAILGUN_DOMAIN');
    }
    return new ConfiguredEmailProvider(mailgunApiKey, mailgunDomain);
  } else if (environment === 'staging') {
    return new DisabledEmailProvider();
  } else {
    // development or tests
    return new MockEmailProvider();
  }
}
