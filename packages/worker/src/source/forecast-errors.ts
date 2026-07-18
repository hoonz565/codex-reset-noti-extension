export type SourceFetchErrorCode =
  | 'NETWORK_TIMEOUT'
  | 'NETWORK_ERROR'
  | 'HTTP_429'
  | 'HTTP_4XX'
  | 'HTTP_5XX'
  | 'INVALID_CONTENT_TYPE'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_JSON'
  | 'SOURCE_SCHEMA_MISMATCH';

export class SourceFetchError extends Error {
  constructor(
    public readonly code: SourceFetchErrorCode,
    message: string,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'SourceFetchError';
  }
}
