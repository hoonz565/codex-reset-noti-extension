export interface ProviderEmailRequest {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type ProviderEmailResult =
  | { outcome: 'accepted'; providerMessageId: string | null }
  | { outcome: 'retryable_failure'; code: string; retryAfterSeconds: number | null }
  | { outcome: 'permanent_failure'; code: string };

export interface EmailProvider {
  send(input: ProviderEmailRequest): Promise<ProviderEmailResult>;
}
