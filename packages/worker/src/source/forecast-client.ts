import { SourceFetchError } from './forecast-errors';
import type { SourceFetchResult } from './source-types';
import { RawForecastSchema } from './raw-forecast-schema';

export interface SourceClientOptions {
  url: string;
  timeoutMs?: number;
  maxRetries?: number;
  maxResponseBytes?: number;
}

export class SourceForecastClient {
  private url: string;
  private timeoutMs: number;
  private maxRetries: number;
  private maxResponseBytes: number;

  constructor(options: SourceClientOptions) {
    this.url = options.url;
    this.timeoutMs = options.timeoutMs || 15000;
    this.maxRetries = options.maxRetries ?? 1;
    this.maxResponseBytes = options.maxResponseBytes ?? 5 * 1024 * 1024; // Default 5MB
  }

  async fetch(now: Date): Promise<SourceFetchResult> {
    let attempt = 0;
    let lastError: SourceFetchError | null = null;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        let response: Response;
        try {
          response = await fetch(this.url, {
            signal: controller.signal,
            headers: {
              Accept: 'application/json',
              'User-Agent':
                'Mozilla/5.0 (compatible; CodexResetNotifier/1.0; +https://github.com/hoonz565/codex-reset-noti-extension)',
              'Cache-Control': 'no-cache',
            },
          });
        } catch (e: unknown) {
          if (e instanceof Error && e.name === 'AbortError') {
            throw new SourceFetchError('NETWORK_TIMEOUT', 'Request timed out');
          }
          throw new SourceFetchError('NETWORK_ERROR', 'Network error');
        } finally {
          clearTimeout(timeoutId);
        }

        if (response.status === 429) {
          const retryAfterStr = response.headers.get('Retry-After');
          const retryAfter = retryAfterStr ? parseInt(retryAfterStr, 10) : undefined;
          throw new SourceFetchError('HTTP_429', 'Rate limited', retryAfter);
        }

        if (response.status >= 500) {
          throw new SourceFetchError('HTTP_5XX', `HTTP Error ${response.status}`);
        }

        if (response.status >= 400) {
          throw new SourceFetchError('HTTP_4XX', `HTTP Error ${response.status}`);
        }

        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new SourceFetchError('INVALID_CONTENT_TYPE', 'Invalid content type');
        }

        const contentLengthStr = response.headers.get('Content-Length');
        if (contentLengthStr !== null) {
          const declaredSize = parseInt(contentLengthStr, 10);
          if (!Number.isNaN(declaredSize) && declaredSize >= 0) {
            if (declaredSize > this.maxResponseBytes) {
              throw new SourceFetchError('RESPONSE_TOO_LARGE', 'Response too large');
            }
          }
        }

        const bodyText = await response.text();
        const encoder = new TextEncoder();
        const actualBytes = encoder.encode(bodyText).length;
        if (actualBytes > this.maxResponseBytes) {
          throw new SourceFetchError('RESPONSE_TOO_LARGE', 'Response too large');
        }

        let rawJson: unknown;
        try {
          rawJson = JSON.parse(bodyText);
        } catch {
          throw new SourceFetchError('INVALID_JSON', 'Invalid JSON');
        }

        const parsed = RawForecastSchema.safeParse(rawJson);
        if (!parsed.success) {
          throw new SourceFetchError('SOURCE_SCHEMA_MISMATCH', 'Schema mismatch');
        }

        return {
          ok: true,
          fetchedAt: now.toISOString(),
          httpStatus: response.status,
          raw: parsed.data,
        };
      } catch (e: unknown) {
        if (e instanceof SourceFetchError) {
          lastError = e;
          // Do not retry 429, 4xx, invalid JSON, or schema mismatch
          if (
            [
              'HTTP_429',
              'HTTP_4XX',
              'INVALID_CONTENT_TYPE',
              'RESPONSE_TOO_LARGE',
              'INVALID_JSON',
              'SOURCE_SCHEMA_MISMATCH',
            ].includes(e.code)
          ) {
            break; // return failure immediately
          }
        } else {
          lastError = new SourceFetchError('NETWORK_ERROR', 'Unknown error');
        }
      }
    }

    return {
      ok: false,
      fetchedAt: now.toISOString(),
      error: lastError || new SourceFetchError('NETWORK_ERROR', 'Unknown error'),
    };
  }
}
