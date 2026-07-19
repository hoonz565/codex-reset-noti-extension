import { StatusApiResponse, StatusApiResponseSchema } from '@codex-reset/shared';

export class StatusClient {
  private baseUrl: string;
  private currentPromise: Promise<StatusApiResponse> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getStatus(): Promise<StatusApiResponse> {
    if (this.currentPromise) {
      return this.currentPromise;
    }

    this.currentPromise = this.fetchStatus().finally(() => {
      this.currentPromise = null;
    });

    return this.currentPromise;
  }

  private async fetchStatus(): Promise<StatusApiResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/status`, {
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        throw new Error('Network error: Timeout');
      }
      throw new Error(`Network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const json = await response.json();

    // Validate response using the shared Zod schema
    const parsed = StatusApiResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error('Invalid response format');
    }

    return parsed.data;
  }
}
