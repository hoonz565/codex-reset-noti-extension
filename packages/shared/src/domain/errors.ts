export type ErrorCode =
  | 'NETWORK_TIMEOUT'
  | 'HTTP_429'
  | 'HTTP_4XX'
  | 'HTTP_5XX'
  | 'INVALID_JSON'
  | 'SOURCE_SCHEMA_MISMATCH'
  | 'INVALID_PROBABILITY'
  | 'MISSING_FORECAST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}
