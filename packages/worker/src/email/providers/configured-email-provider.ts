import { EmailProvider, ProviderEmailRequest, ProviderEmailResult } from '../email-types';
import { EmailProviderError } from '../email-provider-errors';

export class ConfiguredEmailProvider implements EmailProvider {
  constructor(
    private _apiKey: string,
    private _fromAddress: string
  ) {
    if (!this._apiKey) {
      throw new EmailProviderError('Email provider API key is not configured');
    }
  }

  async send(_input: ProviderEmailRequest): Promise<ProviderEmailResult> {
    // In Phase 6, if the production provider isn't fully defined, we use an unconfigured boundary or stub.
    // The requirement states: "If no production email provider has been approved, implement: EmailProvider interface, deterministic MockEmailProvider, typed unconfigured-provider boundary."
    // We throw to prevent real sends until explicitly implemented with a real API like Resend.
    throw new EmailProviderError('UNCONFIGURED_PROVIDER_BOUNDARY');
  }
}
