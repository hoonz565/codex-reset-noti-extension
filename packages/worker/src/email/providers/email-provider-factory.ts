import { EmailProvider } from '../email-types';
import { MockEmailProvider } from './mock-email-provider';
import { DisabledEmailProvider } from './disabled-email-provider';
import { ConfiguredEmailProvider } from './configured-email-provider';

export function createEmailProvider(
  environment: string,
  apiKey?: string,
  fromAddress?: string,
  fetchImplementation?: typeof fetch
): EmailProvider {
  if (environment === 'production') {
    if (!apiKey || !fromAddress) {
      throw new Error(
        'Production environment requires EMAIL_PROVIDER_API_KEY and EMAIL_FROM_ADDRESS'
      );
    }
    return new ConfiguredEmailProvider(apiKey, fromAddress, fetchImplementation);
  } else if (environment === 'staging') {
    return new DisabledEmailProvider();
  } else {
    // development or tests
    return new MockEmailProvider();
  }
}
