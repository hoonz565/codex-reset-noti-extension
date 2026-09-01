import { StatusViewModel, StatusViewState } from '../status/status-view-model';
import { StatusController } from '../status/status-controller';
import { PublicResetStatus } from '@codex-reset/shared';

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return 'Invalid Date';
  }
}

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
      <section class="card status-dashboard" aria-labelledby="status-heading">
        <div class="card-header">
          <div class="card-icon-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <h2 id="status-heading" class="card-title">System Status</h2>
        </div>
        <div class="status-content" aria-live="polite">
          <p class="loading" role="status" aria-busy="true"><span class="sr-only">Loading status...</span>Loading status...</p>
        </div>
        <button id="refresh-status-btn" class="refresh-btn focus-visible" type="button">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span>Refresh</span>
        </button>
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
      if (state.type === 'loading') {
        btn.innerHTML = `
          <svg class="btn-icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span>Refreshing...</span>
        `;
      } else {
        btn.innerHTML = `
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span>Refresh</span>
        `;
      }
    }

    if (!contentEl) return;

    let html = '';

    if (state.type === 'loading') {
      html = `<p class="loading" role="status" aria-busy="true"><span class="sr-only">Loading status...</span>Loading status...</p>`;
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

  private renderLikelihoodGauge(probability: number | null): string {
    const isNum = probability !== null && Number.isFinite(probability);
    const clampedPct = isNum ? Math.min(100, Math.max(0, Math.round(probability as number))) : null;

    // Compact Circle radius = 36 -> 2 * PI * 36 = 226.19
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const offset = clampedPct !== null ? circumference - (clampedPct / 100) * circumference : circumference;

    const displayValue = clampedPct !== null ? `${clampedPct}` : '?';
    const displayUnit = clampedPct !== null ? `<span class="pct-sign">%</span>` : '';
    const progressFillWidth = clampedPct !== null ? `${clampedPct}%` : '0%';
    const scaleUnit = clampedPct !== null ? '%' : '';

    return `
      <div class="likelihood" aria-label="Reset likelihood: ${clampedPct !== null ? clampedPct + ' percent' : 'unknown'}">
        <div class="likelihood-gauge">
          <svg viewBox="0 0 90 90" class="gauge-svg" aria-hidden="true">
            <circle class="gauge-track" cx="45" cy="45" r="${radius}" />
            <circle
              class="gauge-progress"
              cx="45"
              cy="45"
              r="${radius}"
              stroke-dasharray="${circumference.toFixed(2)}"
              stroke-dashoffset="${offset.toFixed(2)}"
            />
          </svg>
          <div class="likelihood-value">
            ${displayValue}${displayUnit}
          </div>
        </div>

        <div class="likelihood-label">
          Likelihood
        </div>

        <div class="likelihood-progress">
          <div class="likelihood-progress-fill" style="width: ${progressFillWidth};"></div>
        </div>

        <div class="likelihood-scale">
          <span>0${scaleUnit}</span>
          <span>50${scaleUnit}</span>
          <span>100${scaleUnit}</span>
        </div>
      </div>
    `;
  }

  private renderStatusData(data: PublicResetStatus): string {
    if (data.state === 'empty') {
      return `<p class="status-badge status-empty" role="status">System has no data yet.</p>`;
    }

    const probability =
      data.state === 'unavailable' ? data.lastKnownProbability : data.probability;

    const gaugeHtml = this.renderLikelihoodGauge(probability);

    let badgeHtml = '';
    if (data.state === 'fresh') {
      badgeHtml = `
        <div class="freshness-row">
          <span class="status-badge status-fresh">
            <span class="status-dot"></span>
            <span class="sr-only">Source state: FRESH</span>
            <span class="badge-text">Fresh</span>
          </span>
        </div>
      `;
    } else if (data.state === 'stale') {
      badgeHtml = `
        <div class="freshness-row">
          <span class="status-badge status-stale">
            <span class="status-dot"></span>
            <span class="sr-only">Source state: STALE</span>
            <span class="badge-text">Stale</span>
          </span>
        </div>
      `;
    } else if (data.state === 'unavailable') {
      badgeHtml = `
        <div class="freshness-row">
          <span class="status-badge status-unavailable">
            <span class="status-dot"></span>
            <span class="sr-only">Source unavailable:</span>
            <span class="badge-text"><span class="sr-only"> UNAVAILABLE</span>Unavailable</span>
          </span>
        </div>
      `;
    }

    const resetAnnouncedText = data.resetAnnounced ? 'Yes' : 'No';

    return `
      ${gaugeHtml}
      ${badgeHtml}
      <div class="info-rows" role="status">
        <div class="info-row">
          <div class="info-row-left">
            <div class="info-icon-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <span class="info-label">Reset Announced</span>
          </div>
          <span class="info-value">${resetAnnouncedText}</span>
          <span class="sr-only">Reset Announced: ${resetAnnouncedText}</span>
        </div>

        <div class="info-row">
          <div class="info-row-left">
            <div class="info-icon-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <span class="info-label">Last checked</span>
          </div>
          ${
            data.checkedAt
              ? `<time class="info-value" datetime="${data.checkedAt}">${formatTime(data.checkedAt)}<span class="sr-only"> (Checked recently)</span></time>`
              : `<span class="info-value muted">—</span>`
          }
        </div>
      </div>
    `;
  }
}
