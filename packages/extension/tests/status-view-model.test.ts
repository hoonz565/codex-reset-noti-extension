/**
 * @vitest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusDashboard } from '../src/components/status-dashboard';
import { StatusViewModel } from '../src/status/status-view-model';
import { StatusController } from '../src/status/status-controller';

describe('Status View Presentation (DASH-VIEW-1..10)', () => {
  let viewModel: StatusViewModel;
  let controller: any;
  let container: HTMLElement;
  let dashboard: StatusDashboard;

  beforeEach(() => {
    document.body.innerHTML = '<div id="dashboard-container"></div>';
    container = document.getElementById('dashboard-container')!;

    viewModel = new StatusViewModel();
    controller = {
      refreshStatus: vi.fn(),
    };

    dashboard = new StatusDashboard(
      'dashboard-container',
      viewModel,
      controller as unknown as StatusController
    );
    dashboard.mount();
  });

  it('DASH-VIEW-1: loading exclusive - loading state is visually exclusive', () => {
    viewModel.setLoading();
    expect(container.textContent).toContain('Loading status...');
    expect(container.textContent).not.toContain('Probability');
  });

  it('DASH-VIEW-2: fresh probability - fresh probability is accurately presented', () => {
    viewModel.setSuccess({
      state: 'fresh',
      probability: 73,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: '2023-01-01T12:00:00Z',
    });
    expect(container.textContent).toContain('FRESH');
    expect(container.textContent).toContain('73');
  });

  it('DASH-VIEW-3: stale label - stale probability is presented with a stale label', () => {
    viewModel.setSuccess({
      state: 'stale',
      probability: 73,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: '2023-01-01T12:00:00Z',
    });
    expect(container.textContent).toContain('STALE');
    expect(container.textContent).toContain('73');
  });

  it('DASH-VIEW-4: unavailable không giả fresh - unavailable does not pretend to be fresh', () => {
    viewModel.setSuccess({
      state: 'unavailable',
      probability: null,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: '2023-01-01T12:00:00Z',
    });
    expect(container.textContent).toContain('UNAVAILABLE');
    expect(container.textContent).not.toContain('FRESH');
    expect(container.textContent).not.toContain('%');
  });

  it('DASH-VIEW-5: announcement copy precedence - announcement copy takes visual precedence over probability', () => {
    viewModel.setSuccess({
      state: 'fresh',
      probability: 99,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: true,
      latestResetAt: '2023-01-01T12:00:00Z',
      resetCycleId: null,
      checkedAt: '2023-01-01T12:00:00Z',
    });
    expect(container.textContent).toContain('Reset Announced: Yes');
  });

  it('DASH-VIEW-6: 100% không suy ra announced - 100% probability does not infer announced state', () => {
    viewModel.setSuccess({
      state: 'fresh',
      probability: 100,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false, // Explicitly false despite 100%
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: '2023-01-01T12:00:00Z',
    });
    expect(container.textContent).toContain('100');
    expect(container.textContent).not.toContain('Reset Announced: Yes');
  });

  it('DASH-VIEW-7: empty khác unavailable - empty state is visually distinct from unavailable state', () => {
    viewModel.setSuccess({
      state: 'empty',
      probability: null,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: null,
    });
    const emptyText = container.textContent;

    viewModel.setSuccess({
      state: 'unavailable',
      probability: null,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: '2023-01-01T12:00:00Z',
    });
    const unavailText = container.textContent;
    expect(emptyText).not.toEqual(unavailText);
    expect(emptyText).toContain('System has no data yet');
  });

  it('DASH-VIEW-8: API error khác source unavailable - API error is visually distinct from source unavailable', () => {
    viewModel.setError('Network API Error');
    const apiErrorText = container.textContent;

    viewModel.setSuccess({
      state: 'unavailable',
      probability: null,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: '2023-01-01T12:00:00Z',
    });
    const sourceUnavailText = container.textContent;

    expect(apiErrorText).not.toEqual(sourceUnavailText);
    expect(apiErrorText).toContain('Error');
    expect(apiErrorText).toContain('Network API Error');
  });

  it('DASH-VIEW-9: invalid timestamp không crash - invalid timestamp does not crash the UI', () => {
    expect(() => {
      viewModel.setSuccess({
        state: 'stale',
        probability: 50,
        lastKnownProbability: null,
        lastKnownObservedAt: null,
        resetAnnounced: false,
        latestResetAt: null,
        resetCycleId: null,
        checkedAt: 'invalid-date',
      });
    }).not.toThrow();
    expect(container.textContent).toContain('STALE');
  });

  it('DASH-VIEW-10: refresh giữ prior state - refreshing preserves prior state visually', () => {
    viewModel.setSuccess({
      state: 'fresh',
      probability: 73,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: '2023-01-01T12:00:00Z',
    });
    expect(container.textContent).toContain('73');

    viewModel.setLoading();
    expect(container.textContent).toContain('73'); // Prior state is preserved
    expect(container.textContent).toContain('Loading status...'); // With loading overlay
  });
});
