import { describe, it, expect } from 'vitest';
import { codexResetStatusSchema, publicStatusResponseSchema } from '../src/schemas/status.schema';
import { rawSourceSchema } from '../src/schemas/source.schema';

describe('status.schema', () => {
  it('Valid persisted CodexResetStatus passes', () => {
    const valid = {
      schemaVersion: 1,
      probability: 73,
      lifecycle: 'none',
      resetCycleId: 'cycle:2026-07-18T03:58:44.000Z',
      latestResetAt: '2026-07-18T03:58:44.000Z',
      announcementAt: null,
      title: 'High likelihood',
      description: 'The estimated reset likelihood is currently 73%.',
      latestSignal: null,
      sourceUrl: 'https://www.willcodexquotareset.com/',
      sourceUpdatedAt: '2026-07-18T05:32:04.594Z',
      checkedAt: '2026-07-18T05:45:00.000Z',
      statusChangedAt: '2026-07-18T03:58:44.000Z',
      publishedAt: '2026-07-18T05:45:02.000Z',
      sourceHealth: 'healthy',
      sourceWarnings: [],
      parserVersion: '1.0.0',
    };
    expect(() => codexResetStatusSchema.parse(valid)).not.toThrow();
  });

  it('Persisted status with checkedAt=null fails', () => {
    const invalid = {
      schemaVersion: 1,
      probability: 73,
      lifecycle: 'none',
      resetCycleId: 'cycle:123',
      latestResetAt: null,
      announcementAt: null,
      title: 'Title',
      description: 'Desc',
      latestSignal: null,
      sourceUrl: 'http://example.com',
      sourceUpdatedAt: null,
      checkedAt: null, // This should fail
      statusChangedAt: '2026-07-18T03:58:44.000Z',
      publishedAt: '2026-07-18T05:45:02.000Z',
      sourceHealth: 'healthy',
      sourceWarnings: [],
      parserVersion: '1.0.0',
    };
    expect(() => codexResetStatusSchema.parse(invalid)).toThrow();
  });

  it('Cold-start PublicStatusResponse with status=null passes', () => {
    const coldStart = {
      ok: true,
      sourceHealth: 'unavailable',
      status: null,
      message: 'No successful source check has completed yet.',
    };
    expect(() => publicStatusResponseSchema.parse(coldStart)).not.toThrow();
  });

  it('Unknown public status fields are handled according to strictness policy', () => {
    const invalid = {
      ok: true,
      sourceHealth: 'healthy',
      status: null,
      unknownField: 'should be rejected',
    };
    expect(() => publicStatusResponseSchema.parse(invalid)).toThrow();
  });

  it('Raw source response permits additional upstream fields', () => {
    const raw = {
      fetchedAt: '2026-07-18T05:32:04.594Z',
      forecast: {
        score: 73,
        resetAnnounced: false,
        latestResetAt: '2026-07-18T03:58:44.000Z',
        unknownUpstreamField: 'allowed',
      },
      tiboPosts: [],
      sourceErrors: {},
      extraRootField: 'allowed',
    };
    expect(() => rawSourceSchema.parse(raw)).not.toThrow();
    const parsed = rawSourceSchema.parse(raw);
    expect(parsed.extraRootField).toBe('allowed');
  });

  it('probability below 0 is rejected', () => {
    const invalid = {
      schemaVersion: 1,
      probability: -1,
      lifecycle: 'none',
      resetCycleId: 'cycle:123',
      latestResetAt: '2026-07-18T03:58:44.000Z',
      announcementAt: null,
      title: 'Title',
      description: 'Desc',
      latestSignal: null,
      sourceUrl: 'http://example.com',
      sourceUpdatedAt: '2026-07-18T05:32:04.594Z',
      checkedAt: '2026-07-18T05:45:00.000Z',
      statusChangedAt: '2026-07-18T03:58:44.000Z',
      publishedAt: '2026-07-18T05:45:02.000Z',
      sourceHealth: 'healthy',
      sourceWarnings: [],
      parserVersion: '1.0.0',
    };
    expect(() => codexResetStatusSchema.parse(invalid)).toThrow();
  });

  it('probability above 100 is rejected', () => {
    const invalid = {
      schemaVersion: 1,
      probability: 101,
      lifecycle: 'none',
      resetCycleId: 'cycle:123',
      latestResetAt: '2026-07-18T03:58:44.000Z',
      announcementAt: null,
      title: 'Title',
      description: 'Desc',
      latestSignal: null,
      sourceUrl: 'http://example.com',
      sourceUpdatedAt: '2026-07-18T05:32:04.594Z',
      checkedAt: '2026-07-18T05:45:00.000Z',
      statusChangedAt: '2026-07-18T03:58:44.000Z',
      publishedAt: '2026-07-18T05:45:02.000Z',
      sourceHealth: 'healthy',
      sourceWarnings: [],
      parserVersion: '1.0.0',
    };
    expect(() => codexResetStatusSchema.parse(invalid)).toThrow();
  });

  it('NaN or Infinity probability is rejected', () => {
    const invalidNaN = {
      schemaVersion: 1,
      probability: NaN,
      lifecycle: 'none',
      resetCycleId: 'cycle:123',
      latestResetAt: '2026-07-18T03:58:44.000Z',
      announcementAt: null,
      title: 'Title',
      description: 'Desc',
      latestSignal: null,
      sourceUrl: 'http://example.com',
      sourceUpdatedAt: '2026-07-18T05:32:04.594Z',
      checkedAt: '2026-07-18T05:45:00.000Z',
      statusChangedAt: '2026-07-18T03:58:44.000Z',
      publishedAt: '2026-07-18T05:45:02.000Z',
      sourceHealth: 'healthy',
      sourceWarnings: [],
      parserVersion: '1.0.0',
    };
    expect(() => codexResetStatusSchema.parse(invalidNaN)).toThrow();
  });

  it('invalid timestamp is rejected', () => {
    const invalidTime = {
      schemaVersion: 1,
      probability: 50,
      lifecycle: 'none',
      resetCycleId: 'cycle:123',
      latestResetAt: '2026-07-18T03:58:44.000Z',
      announcementAt: null,
      title: 'Title',
      description: 'Desc',
      latestSignal: null,
      sourceUrl: 'http://example.com',
      sourceUpdatedAt: '2026-07-18T05:32:04.594Z',
      checkedAt: 'invalid-time',
      statusChangedAt: '2026-07-18T03:58:44.000Z',
      publishedAt: '2026-07-18T05:45:02.000Z',
      sourceHealth: 'healthy',
      sourceWarnings: [],
      parserVersion: '1.0.0',
    };
    expect(() => codexResetStatusSchema.parse(invalidTime)).toThrow();
  });

  it('probability=100 does not infer announced (passes validation with lifecycle=none)', () => {
    const valid = {
      schemaVersion: 1,
      probability: 100,
      lifecycle: 'none',
      resetCycleId: 'cycle:123',
      latestResetAt: '2026-07-18T03:58:44.000Z',
      announcementAt: null,
      title: 'Title',
      description: 'Desc',
      latestSignal: null,
      sourceUrl: 'http://example.com',
      sourceUpdatedAt: '2026-07-18T05:32:04.594Z',
      checkedAt: '2026-07-18T05:45:00.000Z',
      statusChangedAt: '2026-07-18T03:58:44.000Z',
      publishedAt: '2026-07-18T05:45:02.000Z',
      sourceHealth: 'healthy',
      sourceWarnings: [],
      parserVersion: '1.0.0',
    };
    // If schema incorrectly tied probability=100 to lifecycle="announced", this would throw.
    expect(() => codexResetStatusSchema.parse(valid)).not.toThrow();
  });
});
