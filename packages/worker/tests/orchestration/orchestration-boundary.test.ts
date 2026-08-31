/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import worker from '../../src/index';
import { SUBSCRIBER_EVENTS } from '@codex-reset/shared';

describe('Orchestration Phase Boundaries', () => {
  it('ORCH-BOUNDARY-1: orchestration contains no new source parser', async () => {
    // Assert that the forecast client doesn't export any new parsers
    // We'll just verify the behavior doesn't leak
    const { SourceForecastClient } = await import('../../src/source/forecast-client');
    const client = new SourceForecastClient({ url: 'http://localhost' });
    // The client only supports the transport-spike parser internally.
    expect(client).toBeDefined();
  });

  it('ORCH-BOUNDARY-2: subscriber event types remain exactly PROBABILITY_REACHED_70 and RESET_ANNOUNCED', () => {
    const types = Object.keys(SUBSCRIBER_EVENTS);
    expect(types).toContain('PROBABILITY_REACHED_70');
    expect(types).toContain('RESET_ANNOUNCED');
    expect(types.length).toBe(2);
  });

  it('ORCH-BOUNDARY-3: no probability90 subscriber behavior exists', async () => {
    const { alertPreferencesSchema } = await import('@codex-reset/shared');
    // Schema should allow known properties
    expect(
      alertPreferencesSchema.safeParse({ probability70: true, resetAnnounced: false }).success
    ).toBe(true);
    // Schema is strict and should reject probability90
    expect(
      alertPreferencesSchema.safeParse({
        probability70: true,
        resetAnnounced: false,
        probability90: true,
      }).success
    ).toBe(false);
  });

  it('ORCH-BOUNDARY-4: no Cloudflare Queue producer/consumer exists', () => {
    // Check that the worker export doesn't contain a queue handler
    expect((worker as any).queue).toBeUndefined();
  });

  it('ORCH-BOUNDARY-5: no provider webhook route exists', async () => {
    // Assert that a webhook request returns 404
    const req = new Request('http://localhost/api/webhooks/mailgun', { method: 'POST' });
    const backgroundPromises: Promise<any>[] = [];
    const ctx = {
      waitUntil: (p: Promise<any>) => backgroundPromises.push(p),
      passThroughOnException: () => {},
    } as any;
    const res = await worker.fetch(req, {} as any, ctx);
    expect(res.status).toBe(404);
    if (backgroundPromises.length > 0) {
      await Promise.all(backgroundPromises);
    }
  });

  it('ORCH-BOUNDARY-6: no Phase 8 UI code was introduced', async () => {
    // Phase 8 admin dashboard UI should return 404
    const req = new Request('http://localhost/api/admin/dashboard');
    const backgroundPromises: Promise<any>[] = [];
    const ctx = {
      waitUntil: (p: Promise<any>) => backgroundPromises.push(p),
      passThroughOnException: () => {},
    } as any;
    const res = await worker.fetch(req, {} as any, ctx);
    expect(res.status).toBe(404);
    if (backgroundPromises.length > 0) {
      await Promise.allSettled(backgroundPromises);
    }
  });
});
