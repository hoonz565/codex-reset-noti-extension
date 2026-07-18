/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { SourceNormalizer } from '../../src/source/source-normalizer';
import { RawForecastSchema } from '../../src/source/raw-forecast-schema';

describe('SourceNormalizer', () => {
  it('SRC-NORM-1: score=73 produces probability=73', () => {
    expect(SourceNormalizer.normalizeProbability(73)).toEqual({ ok: true, probability: 73 });
  });

  it('SRC-NORM-2: score=100 and resetAnnounced=false is not announced', () => {
    expect(SourceNormalizer.normalizeLifecycle(false, 99, undefined)).toBeNull();
  });

  it('SRC-NORM-3: score=100 and resetAnnounced=true produces announced lifecycle', () => {
    expect(SourceNormalizer.normalizeLifecycle(true, 99, undefined)).toBe('announced');
  });

  it('SRC-NORM-4: score below 0 is SCORE_OUT_OF_RANGE', () => {
    expect(SourceNormalizer.normalizeProbability(-1)).toEqual({
      ok: false,
      reason: 'SCORE_OUT_OF_RANGE',
    });
  });

  it('SRC-NORM-5: score above 100 is SCORE_OUT_OF_RANGE', () => {
    expect(SourceNormalizer.normalizeProbability(101)).toEqual({
      ok: false,
      reason: 'SCORE_OUT_OF_RANGE',
    });
  });

  it('SRC-NORM-6: numeric string is INVALID_SCORE_TYPE', () => {
    expect(SourceNormalizer.normalizeProbability('73' as any)).toEqual({
      ok: false,
      reason: 'INVALID_SCORE_TYPE',
    });
  });

  it('SRC-NORM-7: probability and lifecycle remain independent', () => {
    expect(SourceNormalizer.normalizeProbability(100)).toEqual({ ok: true, probability: 100 });
    expect(SourceNormalizer.normalizeLifecycle(false, undefined, undefined)).toBeNull();
  });

  it('SRC-NORM-8: unknown extra upstream fields do not break normalization', () => {
    const raw = {
      forecast: { score: 50, resetAnnounced: false, unknownExtra: true },
      unknownRoot: 'value',
    };
    const parsed = RawForecastSchema.parse(raw);
    expect(parsed.forecast?.score).toBe(50);
  });

  it('SRC-NORM-9: missing score is MISSING_SCORE', () => {
    expect(SourceNormalizer.normalizeProbability(undefined)).toEqual({
      ok: false,
      reason: 'MISSING_SCORE',
    });
  });

  it('SRC-NORM-10: NaN or Infinity is SCORE_NOT_FINITE', () => {
    expect(SourceNormalizer.normalizeProbability(NaN)).toEqual({
      ok: false,
      reason: 'SCORE_NOT_FINITE',
    });
    expect(SourceNormalizer.normalizeProbability(Infinity)).toEqual({
      ok: false,
      reason: 'SCORE_NOT_FINITE',
    });
  });
});
