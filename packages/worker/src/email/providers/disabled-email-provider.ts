import { EmailProvider, ProviderEmailRequest, ProviderEmailResult } from '../email-types';

export class DisabledEmailProvider implements EmailProvider {
  async send(_request: ProviderEmailRequest): Promise<ProviderEmailResult> {
    return { outcome: 'accepted', providerMessageId: 'disabled-staging-send' };
  }
}
