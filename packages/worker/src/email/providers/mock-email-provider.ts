import { EmailProvider, ProviderEmailRequest, ProviderEmailResult } from '../email-types';

export class MockEmailProvider implements EmailProvider {
  public calls: ProviderEmailRequest[] = [];
  public nextResult: ProviderEmailResult = {
    outcome: 'accepted',
    providerMessageId: 'mock-msg-id',
  };

  async send(input: ProviderEmailRequest): Promise<ProviderEmailResult> {
    this.calls.push(input);
    return this.nextResult;
  }
}
