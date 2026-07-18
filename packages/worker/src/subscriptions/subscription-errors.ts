export type PublicErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_PREFERENCES'
  | 'RATE_LIMITED'
  | 'INVALID_TOKEN'
  | 'EXPIRED_TOKEN'
  | 'TOKEN_ALREADY_USED'
  | 'UNAUTHORIZED'
  | 'SUBSCRIPTION_NOT_MANAGEABLE'
  | 'PAYLOAD_TOO_LARGE'
  | 'CONFLICT'
  | 'INVALID_EMAIL'
  | 'INTERNAL_ERROR';

export class SubscriptionError extends Error {
  constructor(
    public code: PublicErrorCode,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'SubscriptionError';
  }
}
