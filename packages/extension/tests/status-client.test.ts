/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusClient } from '../src/api/status-client';

describe('StatusClient', () => {
  let client: StatusClient;
  let consoleSpy: any;

  beforeEach(() => {
    client = new StatusClient('http://test.local');
    vi.stubGlobal('fetch', vi.fn());
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('DASH-CLIENT-1: only Worker /api/status is requested', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        status: {
          state: 'empty',
          probability: null,
          lastKnownProbability: null,
          lastKnownObservedAt: null,
          resetAnnounced: false,
          latestResetAt: null,
          resetCycleId: null,
          checkedAt: null,
        },
        generatedAt: '2023-01-01T00:00:00Z',
      }),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    await client.getStatus();
    expect(global.fetch).toHaveBeenCalledWith(
      'http://test.local/api/status',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('DASH-CLIENT-2: upstream source is never requested', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        status: {
          state: 'empty',
          probability: null,
          lastKnownProbability: null,
          lastKnownObservedAt: null,
          resetAnnounced: false,
          latestResetAt: null,
          resetCycleId: null,
          checkedAt: null,
        },
        generatedAt: '2023-01-01T00:00:00Z',
      }),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    await client.getStatus();
    // Verify fetch is never called with the actual source URL (which we would assume could be an accidental leakage)
    const calls = (global.fetch as any).mock.calls;
    expect(calls.some((c: any) => c[0].includes('source.example.com'))).toBe(false);
  });

  it('DASH-CLIENT-3: valid response runtime-validates', async () => {
    const data = {
      schemaVersion: 1,
      status: {
        state: 'empty',
        probability: null,
        lastKnownProbability: null,
        lastKnownObservedAt: null,
        resetAnnounced: false,
        latestResetAt: null,
        resetCycleId: null,
        checkedAt: null,
      },
      generatedAt: '2023-01-01T00:00:00Z',
    };
    const mockResponse = {
      ok: true,
      json: async () => data,
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const res = await client.getStatus();
    expect(res).toEqual(data);
  });

  it('DASH-CLIENT-4: invalid schema maps to typed error', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        schemaVersion: 1, // missing fields
      }),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    await expect(client.getStatus()).rejects.toThrow('Invalid response format');
  });

  it('DASH-CLIENT-5: network failure maps to typed error', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network down'));

    await expect(client.getStatus()).rejects.toThrow('Network error: Network down');
  });

  it('DASH-CLIENT-6: timeout aborts safely', async () => {
    vi.useFakeTimers();

    try {
      let capturedSignal: AbortSignal | undefined;
      (global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
        capturedSignal = init?.signal;
        // Return a promise that never resolves natively
        return new Promise((resolve, reject) => {
          // Listen to the abort signal to reject the promise, simulating real fetch behavior
          if (capturedSignal) {
            capturedSignal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      });

      const promise = client.getStatus();

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(false);

      // Advance timers beyond the 10-second timeout
      vi.advanceTimersByTime(11000);

      // Assert signal aborted
      expect(capturedSignal?.aborted).toBe(true);

      // Assert rejection with typed error
      await expect(promise).rejects.toThrow('Network error: Timeout');

      // Assert timers are cleared automatically by our client logic
      expect(vi.getTimerCount()).toBe(0);

      // Assert in-flight request state is cleaned up
      // A subsequent call should start a new fetch
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          status: {
            state: 'empty',
            probability: null,
            lastKnownProbability: null,
            lastKnownObservedAt: null,
            resetAnnounced: false,
            latestResetAt: null,
            resetCycleId: null,
            checkedAt: null,
          },
          generatedAt: '2023-01-01T00:00:00Z',
        }),
      });

      await client.getStatus();
      expect(global.fetch).toHaveBeenCalledTimes(2); // First failed, second succeeded
    } finally {
      vi.useRealTimers();
    }
  });

  it('DASH-CLIENT-7: concurrent calls reuse the in-flight promise', async () => {
    let resolveFetch: any;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    const mockResponse = {
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        status: {
          state: 'empty',
          probability: null,
          lastKnownProbability: null,
          lastKnownObservedAt: null,
          resetAnnounced: false,
          latestResetAt: null,
          resetCycleId: null,
          checkedAt: null,
        },
        generatedAt: '2023-01-01T00:00:00Z',
      }),
    };

    (global.fetch as any).mockReturnValue(fetchPromise);

    const p1 = client.getStatus();
    const p2 = client.getStatus();

    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveFetch(mockResponse);

    await Promise.all([p1, p2]);
  });

  it('DASH-CLIENT-8: no response body, token or secret is logged', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        status: {
          state: 'empty',
          probability: null,
          lastKnownProbability: null,
          lastKnownObservedAt: null,
          resetAnnounced: false,
          latestResetAt: null,
          resetCycleId: null,
          checkedAt: null,
        },
        generatedAt: '2023-01-01T00:00:00Z',
      }),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    await client.getStatus();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('CLIENT-EXTRA-1: handles non-200 responses gracefully', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    await expect(client.getStatus()).rejects.toThrow('HTTP error: 500');
  });

  it('CLIENT-EXTRA-2: clears in-flight promise after resolution', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        status: {
          state: 'empty',
          probability: null,
          lastKnownProbability: null,
          lastKnownObservedAt: null,
          resetAnnounced: false,
          latestResetAt: null,
          resetCycleId: null,
          checkedAt: null,
        },
        generatedAt: '2023-01-01T00:00:00Z',
      }),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    await client.getStatus();
    await client.getStatus();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('CLIENT-EXTRA-3: handles malformed JSON response', async () => {
    const mockResponse = {
      ok: true,
      json: async () => {
        throw new Error('Unexpected token');
      },
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    await expect(client.getStatus()).rejects.toThrow();
  });
});
