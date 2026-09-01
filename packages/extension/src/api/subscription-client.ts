import {
  CreateSubscriptionRequest,
  createSubscriptionRequestSchema,
  genericAcceptedResponseSchema,
} from '@codex-reset/shared';

export class SubscriptionClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubscriptionClientError';
  }
}

export class SubscriptionClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImplementation: typeof fetch = fetch.bind(globalThis)
  ) {}

  async subscribe(input: CreateSubscriptionRequest): Promise<string> {
    const payload = createSubscriptionRequestSchema.parse(input);
    const response = await this.fetchImplementation(`${this.baseUrl}/api/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        typeof body === 'object' && body !== null && 'error' in body
          ? String(body.error)
          : 'The subscription request could not be completed.';
      throw new SubscriptionClientError(message);
    }

    const accepted = genericAcceptedResponseSchema.safeParse(body);
    if (!accepted.success) {
      throw new SubscriptionClientError('The server returned an invalid response.');
    }
    return accepted.data.message;
  }

  async requestManagementLink(email: string): Promise<string> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/api/subscriptions/request-management-link`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        typeof body === 'object' && body !== null && 'error' in body
          ? String(body.error)
          : 'The management-link request could not be completed.';
      throw new SubscriptionClientError(message);
    }

    const accepted = genericAcceptedResponseSchema.safeParse(body);
    if (!accepted.success) {
      throw new SubscriptionClientError('The server returned an invalid response.');
    }
    return accepted.data.message;
  }
}
