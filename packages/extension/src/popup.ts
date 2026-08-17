import { StatusClient } from './api/status-client';
import { SubscriptionClient } from './api/subscription-client';
import { StatusViewModel } from './status/status-view-model';
import { StatusController } from './status/status-controller';
import { StatusDashboard } from './components/status-dashboard';

// Access the injected variable
const API_BASE = process.env.WORKER_API_BASE_URL || 'http://127.0.0.1:8787';

let dashboard: StatusDashboard | null = null;
const subscriptionClient = new SubscriptionClient(API_BASE);

function initStatusDashboard() {
  const client = new StatusClient(API_BASE);
  const viewModel = new StatusViewModel();
  const controller = new StatusController(client, viewModel);

  dashboard = new StatusDashboard('dashboard-container', viewModel, controller);
  dashboard.mount();
}

async function subscribe() {
  const resultDiv = document.getElementById('sub-result')!;
  const submitButton = document.getElementById('subscribe-btn') as HTMLButtonElement;
  const emailInput = document.getElementById('email') as HTMLInputElement;
  const alert70 = document.getElementById('alert-70') as HTMLInputElement;
  const alertAnnounced = document.getElementById('alert-announced') as HTMLInputElement;

  resultDiv.textContent = 'Submitting…';
  resultDiv.className = 'form-message';
  submitButton.disabled = true;

  const payload = {
    email: emailInput.value,
    preferences: {
      probability70: alert70.checked,
      resetAnnounced: alertAnnounced.checked,
    },
  };

  try {
    const message = await subscriptionClient.subscribe(payload);
    resultDiv.textContent = `${message} Check your inbox for the confirmation link.`;
    resultDiv.className = 'form-message success';
    emailInput.value = '';
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    resultDiv.textContent = msg;
    resultDiv.className = 'form-message error';
  } finally {
    submitButton.disabled = false;
  }
}

async function requestManagementLink() {
  const emailInput = document.getElementById('manage-email') as HTMLInputElement;
  const resultDiv = document.getElementById('manage-result')!;
  const button = document.getElementById('manage-btn') as HTMLButtonElement;
  resultDiv.textContent = 'Submitting…';
  resultDiv.className = 'form-message';
  button.disabled = true;

  try {
    const message = await subscriptionClient.requestManagementLink(emailInput.value);
    resultDiv.textContent = `${message} Check your inbox for a secure management link.`;
    resultDiv.className = 'form-message success';
    emailInput.value = '';
  } catch (error: unknown) {
    resultDiv.textContent = error instanceof Error ? error.message : String(error);
    resultDiv.className = 'form-message error';
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initStatusDashboard();
  document.getElementById('subscribe-btn')?.addEventListener('click', subscribe);
  document.getElementById('manage-btn')?.addEventListener('click', requestManagementLink);
});
