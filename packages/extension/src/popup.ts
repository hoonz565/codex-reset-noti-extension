import { createSubscriptionRequestSchema } from '@codex-reset/shared';

import { StatusClient } from './api/status-client';
import { StatusViewModel } from './status/status-view-model';
import { StatusController } from './status/status-controller';
import { StatusDashboard } from './components/status-dashboard';

// Access the injected variable
const API_BASE = process.env.WORKER_API_BASE_URL || 'http://127.0.0.1:8787';

let dashboard: StatusDashboard | null = null;

function initStatusDashboard() {
  const client = new StatusClient(API_BASE);
  const viewModel = new StatusViewModel();
  const controller = new StatusController(client, viewModel);

  dashboard = new StatusDashboard('dashboard-container', viewModel, controller);
  dashboard.mount();
}

async function subscribe() {
  const resultDiv = document.getElementById('sub-result')!;
  const emailInput = document.getElementById('email') as HTMLInputElement;
  const alert70 = document.getElementById('alert-70') as HTMLInputElement;
  const alertAnnounced = document.getElementById('alert-announced') as HTMLInputElement;

  resultDiv.textContent = 'Submitting...';
  resultDiv.className = '';

  const payload = {
    email: emailInput.value,
    preferences: {
      probability70: alert70.checked,
      resetAnnounced: alertAnnounced.checked,
    },
  };

  try {
    // Validate locally (optional, but demonstrates shared schema)
    // We only use the required fields for the api schema
    const requestPayload = { email: payload.email, preferences: payload.preferences };
    createSubscriptionRequestSchema.parse(requestPayload);

    const res = await fetch(`${API_BASE}/api/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (res.ok) {
      resultDiv.textContent = `Success: ${data.message} (ID: ${data.subscription.id})`;
      resultDiv.className = 'success';
    } else {
      resultDiv.textContent = `Error: ${data.error} - ${JSON.stringify(data.details)}`;
      resultDiv.className = 'error';
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    resultDiv.textContent = `Client Error: ${msg}`;
    resultDiv.className = 'error';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initStatusDashboard();
  document.getElementById('subscribe-btn')?.addEventListener('click', subscribe);
});
