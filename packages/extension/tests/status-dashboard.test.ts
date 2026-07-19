/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusDashboard } from '../src/components/status-dashboard';
import { StatusViewModel } from '../src/status/status-view-model';
import { StatusController } from '../src/status/status-controller';
import userEvent from '@testing-library/user-event';

describe('StatusDashboard', () => {
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
  });

  it('DASH-A11Y-1: semantic heading', () => {
    dashboard.mount();
    const h2 = container.querySelector('h2');
    expect(h2).not.toBeNull();
    expect(h2?.textContent).toBe('System Status');
  });

  it('DASH-A11Y-2: readable non-color-only badge', () => {
    dashboard.mount();
    viewModel.setSuccess({
      state: 'fresh',
      probability: 80,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: true,
      latestResetAt: '2023-01-01',
      resetCycleId: 'c1',
      checkedAt: '2023-01-01',
    });

    const badge = container.querySelector('.status-badge');
    expect(badge?.textContent).toContain('Source state: FRESH');
  });

  it('DASH-A11Y-3: keyboard-accessible refresh control', async () => {
    const user = userEvent.setup();
    dashboard.mount();
    const btn = container.querySelector<HTMLButtonElement>('#refresh-status-btn');
    expect(btn?.tagName).toBe('BUTTON');

    // Set success so it's not disabled
    viewModel.setSuccess({
      state: 'fresh',
      probability: 80,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: null,
    });

    // Clear initial mount refresh call
    vi.clearAllMocks();

    // Native buttons trigger click when focused and Enter/Space is pressed
    btn?.focus();
    await user.keyboard('{Enter}');
    expect(controller.refreshStatus).toHaveBeenCalledTimes(1); // 1 for Enter

    vi.clearAllMocks();

    await user.keyboard(' '); // space bar
    expect(controller.refreshStatus).toHaveBeenCalledTimes(1); // 1 for Space

    // Disabled state prevents duplicate
    vi.clearAllMocks();
    viewModel.setLoading();
    expect(btn?.disabled).toBe(true);
    await user.keyboard('{Enter}');
    expect(controller.refreshStatus).toHaveBeenCalledTimes(0); // 0 for Disabled
  });

  it('DASH-A11Y-4: accessible loading text', () => {
    dashboard.mount();
    viewModel.setLoading();
    const loader = container.querySelector('.loading');

    // Must have role="status" and exist in an aria-live region (verified in EXTRA-1)
    expect(loader?.getAttribute('role')).toBe('status');
    expect(loader?.getAttribute('aria-busy')).toBe('true'); // busy alone is insufficient, but good to have

    const srOnlyText = loader?.querySelector('.sr-only');
    expect(srOnlyText?.textContent).toBe('Loading status...');
  });

  it('DASH-A11Y-5: screen-reader distinction between error and unavailable', () => {
    dashboard.mount();
    viewModel.setSuccess({
      state: 'unavailable',
      probability: null,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: false,
      latestResetAt: null,
      resetCycleId: null,
      checkedAt: null,
    });
    const unavailableSr = container.querySelector('.status-unavailable .sr-only')?.textContent;
    expect(unavailableSr).toBe('Source unavailable:');

    viewModel.setError('Network issue');
    const errorSr = container.querySelector('.status-error .sr-only')?.textContent;
    expect(errorSr).toBe('API Error:');
  });

  it('DASH-A11Y-6: accessible absolute timestamp for relative time', () => {
    dashboard.mount();
    viewModel.setSuccess({
      state: 'fresh',
      probability: 80,
      lastKnownProbability: null,
      lastKnownObservedAt: null,
      resetAnnounced: true,
      latestResetAt: '2023-01-01',
      resetCycleId: 'c1',
      checkedAt: '2023-01-01T12:00:00.000Z',
    });

    const timeTag = container.querySelector('time');
    expect(timeTag).not.toBeNull();
    // Proving a valid absolute ISO datetime is assigned and there is visible relative text
    expect(timeTag?.getAttribute('datetime')).toBe('2023-01-01T12:00:00.000Z');
    expect(timeTag?.textContent).toContain('Checked recently');
  });

  it('A11Y-EXTRA-1: includes aria-live="polite" region', () => {
    dashboard.mount();
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
  });

  it('A11Y-EXTRA-2: refresh button has focus-visible styling hooks', () => {
    dashboard.mount();
    const btn = container.querySelector('#refresh-status-btn');
    expect(btn?.classList.contains('focus-visible')).toBe(true);
  });
});
