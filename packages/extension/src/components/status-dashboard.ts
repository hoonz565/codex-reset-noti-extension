import { StatusViewModel, StatusViewState } from '../status/status-view-model';
import { StatusController } from '../status/status-controller';
import { PublicResetStatus } from '@codex-reset/shared';

export class StatusDashboard {
  private container: HTMLElement;
  private unsubscribe: (() => void) | null = null;

  constructor(
    containerId: string,
    private viewModel: StatusViewModel,
    private controller: StatusController
  ) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container ${containerId} not found`);
    this.container = el;
  }

  mount() {
    this.renderSkeleton();
    this.unsubscribe = this.viewModel.subscribe((state) => this.render(state));
    // Initial fetch
    this.controller.refreshStatus();
  }

  unmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.container.innerHTML = '';
  }

  private renderSkeleton() {
    this.container.innerHTML = `
      <section class="status-dashboard" aria-labelledby="status-heading">
        <h2 id="status-heading">System Status</h2>
        <div class="status-content" aria-live="polite">
          <p class="loading" aria-busy="true">Loading status...</p>
        </div>
        <button id="refresh-status-btn" class="refresh-btn focus-visible">Refresh</button>
      </section>
    `;
    this.attachRefreshHandler();
  }

  private attachRefreshHandler() {
    const btn = this.container.querySelector<HTMLButtonElement>('#refresh-status-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (!btn.disabled) this.controller.refreshStatus();
      });
    }
  }

  private render(state: StatusViewState) {
    const contentEl = this.container.querySelector('.status-content');
    const btn = this.container.querySelector<HTMLButtonElement>('#refresh-status-btn');

    if (btn) {
      btn.disabled = state.type === 'loading';
    }

    if (!contentEl) return;

    let html = '';

    if (state.type === 'loading') {
      html = `<p class="loading" role="status" aria-busy="true"><span class="sr-only">Loading status...</span>Loading...</p>`;
      if (state.oldData) {
        html += `<div class="old-data-overlay" aria-hidden="true">${this.renderStatusData(state.oldData)}</div>`;
      }
    } else if (state.type === 'error') {
      html = `<div class="status-error" role="alert"><p><span class="sr-only">API Error:</span> ${state.message}</p></div>`;
      if (state.oldData) {
        html += `<div class="old-data-overlay" aria-hidden="true">${this.renderStatusData(state.oldData)}</div>`;
      }
    } else if (state.type === 'success') {
      html = this.renderStatusData(state.data);
    }

    contentEl.innerHTML = html;
  }

  private renderStatusData(data: PublicResetStatus): string {
    if (data.state === 'empty') {
      return `<p class="status-badge status-empty" role="status">System has no data yet.</p>`;
    }

    const stateClass = `status-${data.state}`;
    let probabilityText = '';

    if (data.state === 'unavailable') {
      probabilityText =
        data.lastKnownProbability !== null
          ? `Last known probability: ${data.lastKnownProbability}%`
          : 'Probability unknown';
    } else {
      probabilityText = `Current probability: ${data.probability}%`;
    }

    const timeText = data.checkedAt
      ? `<time datetime="${data.checkedAt}">Checked recently (${new Date(data.checkedAt).toLocaleTimeString()})</time>`
      : '';

    const srPrefix = data.state === 'unavailable' ? 'Source unavailable:' : 'Source state:';

    return `
      <div class="status-badge ${stateClass}" role="status">
        <strong><span class="sr-only">${srPrefix}</span> ${data.state.toUpperCase()}</strong>
      </div>
      <div class="status-details">
        <p>${probabilityText}</p>
        <p>Reset Announced: ${data.resetAnnounced ? 'Yes' : 'No'}</p>
        <p>${timeText}</p>
      </div>
    `;
  }
}
