/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { MeaningfulChangeClassifier } from '../../src/source/meaningful-change';
import type { CodexResetStatus } from '@codex-reset/shared';

describe('MeaningfulChangeClassifier', () => {
  const baseStatus: CodexResetStatus = {
    schemaVersion: '1.0.0',
    probability: 10,
    lifecycle: 'none',
    resetCycleId: 'c1',
    latestResetAt: '2026-07-14T10:00:00Z',
    announcementAt: null,
    title: 'Low',
    description: '',
    latestSignal: null,
    sourceUrl: 'https://test',
    sourceUpdatedAt: '2026-07-18T12:00:00Z',
    checkedAt: '2026-07-18T12:00:00Z',
    statusChangedAt: '2026-07-18T12:00:00Z',
    publishedAt: '2026-07-18T12:00:00Z',
    sourceHealth: 'healthy',
    sourceWarnings: [],
    parserVersion: '1.0.0',
  };

  it('SRC-CHANGE-1: No previous snapshot follows bootstrap meaningful policy', () => {
    expect(MeaningfulChangeClassifier.isMeaningful(null, baseStatus)).toBe(true);
  });

  it('SRC-CHANGE-2: Lifecycle change is meaningful', () => {
    const curr = { ...baseStatus, lifecycle: 'announced' } as CodexResetStatus;
    expect(MeaningfulChangeClassifier.isMeaningful(baseStatus, curr)).toBe(true);
  });

  it('SRC-CHANGE-3: latestResetAt change is meaningful', () => {
    const curr = { ...baseStatus, latestResetAt: '2026-07-18T10:00:00Z' };
    expect(MeaningfulChangeClassifier.isMeaningful(baseStatus, curr)).toBe(true);
  });

  it('SRC-CHANGE-4: Probability changes within same band are not meaningful', () => {
    // 10 -> 15 (both in 0-25 band)
    const curr = { ...baseStatus, probability: 15 };
    expect(MeaningfulChangeClassifier.isMeaningful(baseStatus, curr)).toBe(false);
  });

  it('SRC-CHANGE-5: Probability crossing into 70–100 is meaningful', () => {
    // 10 -> 75
    const curr = { ...baseStatus, probability: 75 };
    expect(MeaningfulChangeClassifier.isMeaningful(baseStatus, curr)).toBe(true);
  });

  it('SRC-CHANGE-6: Latest signal identity change is meaningful', () => {
    const prev = { ...baseStatus, latestSignal: { id: '1' } } as any;
    const curr = { ...baseStatus, latestSignal: { id: '2' } } as any;
    expect(MeaningfulChangeClassifier.isMeaningful(prev, curr)).toBe(true);
  });

  it('SRC-CHANGE-7: Source health change is meaningful', () => {
    const curr = { ...baseStatus, sourceHealth: 'degraded' } as CodexResetStatus;
    expect(MeaningfulChangeClassifier.isMeaningful(baseStatus, curr)).toBe(true);
  });

  it('SRC-CHANGE-8: Only checkedAt changes is not meaningful', () => {
    const curr = { ...baseStatus, checkedAt: '2026-07-18T12:05:00Z' };
    expect(MeaningfulChangeClassifier.isMeaningful(baseStatus, curr)).toBe(false);
  });

  it('SRC-CHANGE-9: resetCycleId change is meaningful', () => {
    const curr = { ...baseStatus, resetCycleId: 'c2' };
    expect(MeaningfulChangeClassifier.isMeaningful(baseStatus, curr)).toBe(true);
  });
});
