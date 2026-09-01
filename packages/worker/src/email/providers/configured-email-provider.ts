import { EmailProvider, ProviderEmailRequest, ProviderEmailResult } from '../email-types';
import { EmailProviderError } from '../email-provider-errors';

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';
const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 10_000;

type FetchImplementation = typeof fetch;

interface ResendSuccessResponse {
  id: string;
}

interface ResendErrorResponse {
  name?: string;
  type?: string;
}

function normalizeProviderCode(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const normalized = input
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .slice(0, 64);
  return normalized || fallback;
}

function parseRetryAfter(response: Response): number | null {
  const raw = response.headers.get('Retry-After');
  if (!raw) return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.ceil(seconds), MAX_RETRY_AFTER_SECONDS);
  }

  const retryAt = Date.parse(raw);
  if (Number.isNaN(retryAt)) return null;
  const derivedSeconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  return Math.min(derivedSeconds, MAX_RETRY_AFTER_SECONDS);
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class ConfiguredEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string,
    private readonly fetchImplementation: FetchImplementation = fetch.bind(globalThis)
  ) {
    if (!apiKey) {
      throw new EmailProviderError('EMAIL_PROVIDER_API_KEY is not configured');
    }
    if (!fromAddress || !fromAddress.includes('@')) {
      throw new EmailProviderError('EMAIL_FROM_ADDRESS is not configured');
    }
  }

  async send(input: ProviderEmailRequest): Promise<ProviderEmailResult> {
    let response: Response;
    try {
      response = await this.fetchImplementation(RESEND_EMAILS_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'codex-reset-notifier/1.0',
          ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return {
        outcome: 'retryable_failure',
        code: 'NETWORK_ERROR',
        retryAfterSeconds: null,
      };
    }

    const payload = await parseJson(response);
    if (response.ok) {
      const messageId = (payload as ResendSuccessResponse | null)?.id;
      if (typeof messageId === 'string' && messageId.length > 0) {
        return { outcome: 'accepted', providerMessageId: messageId };
      }
      return {
        outcome: 'retryable_failure',
        code: 'INVALID_PROVIDER_RESPONSE',
        retryAfterSeconds: null,
      };
    }

    const error = payload as ResendErrorResponse | null;
    const code = normalizeProviderCode(error?.name ?? error?.type, `HTTP_${response.status}`);
    const isRetryable =
      response.status === 408 ||
      response.status === 409 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500;

    if (isRetryable) {
      return {
        outcome: 'retryable_failure',
        code,
        retryAfterSeconds: parseRetryAfter(response),
      };
    }

    return { outcome: 'permanent_failure', code };
  }
}
