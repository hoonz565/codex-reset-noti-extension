/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { LatestSignalSelector } from '../../src/source/latest-signal';
import type { RawForecastData } from '../../src/source/raw-forecast-schema';

describe('LatestSignalSelector', () => {
  it('SRC-SIGNAL-1: No posts produces null', () => {
    expect(LatestSignalSelector.select({ tiboPosts: [] } as any)).toBeNull();
  });

  it('SRC-SIGNAL-2: All category none produces null', () => {
    expect(
      LatestSignalSelector.select({
        tiboPosts: [{ id: '1', category: 'none', publishedAt: '2026-07-18T10:00:00Z' }],
      } as any)
    ).toBeNull();
  });

  it('SRC-SIGNAL-3: Newest relevant post is selected', () => {
    const raw: RawForecastData = {
      tiboPosts: [
        { id: '1', category: 'update', publishedAt: '2026-07-18T10:00:00Z' },
        { id: '2', category: 'update', publishedAt: '2026-07-18T11:00:00Z' },
      ],
    } as any;
    const res = LatestSignalSelector.select(raw);
    expect(res?.id).toBe('2');
  });

  it('SRC-SIGNAL-4: Older stronger post does not beat newer relevant post', () => {
    const raw: RawForecastData = {
      tiboPosts: [
        {
          id: '1',
          category: 'update',
          publishedAt: '2026-07-18T10:00:00Z',
          tweetAssessment: { strength: 10 },
        },
        {
          id: '2',
          category: 'update',
          publishedAt: '2026-07-18T11:00:00Z',
          tweetAssessment: { strength: 5 },
        },
      ],
    } as any;
    const res = LatestSignalSelector.select(raw);
    expect(res?.id).toBe('2');
  });

  it('SRC-SIGNAL-5: Malformed publication date is ignored or safely handled according to the documented policy', () => {
    const raw: RawForecastData = {
      tiboPosts: [
        { id: '1', category: 'update', publishedAt: 'invalid-date' },
        { id: '2', category: 'update', publishedAt: '2026-07-18T11:00:00Z' },
      ],
    } as any;
    const res = LatestSignalSelector.select(raw);
    expect(res?.id).toBe('2');
  });

  it('SRC-SIGNAL-6: Duplicate signal identity is deduplicated', () => {
    const raw: RawForecastData = {
      tiboPosts: [
        { id: '2', category: 'update', publishedAt: '2026-07-18T11:00:00Z' },
        { id: '2', category: 'update', publishedAt: '2026-07-18T11:00:00Z' },
      ],
    } as any;
    // It should just return one without blowing up
    const res = LatestSignalSelector.select(raw);
    expect(res?.id).toBe('2');
  });

  it('SRC-SIGNAL-7: Missing URL is accepted', () => {
    const raw: RawForecastData = {
      tiboPosts: [{ id: '2', category: 'update', publishedAt: '2026-07-18T11:00:00Z', url: null }],
    } as any;
    const res = LatestSignalSelector.select(raw);
    expect(res?.url).toBeNull();
  });

  it('SRC-SIGNAL-8: Missing strength is accepted', () => {
    const raw: RawForecastData = {
      tiboPosts: [
        {
          id: '2',
          category: 'update',
          publishedAt: '2026-07-18T11:00:00Z',
          tweetAssessment: { strength: null },
        },
      ],
    } as any;
    const res = LatestSignalSelector.select(raw);
    expect(res?.strength).toBeNull();
  });
});
