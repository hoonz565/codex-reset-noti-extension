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

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0];
        if (first.path?.includes('email') || first.validation === 'email') {
          return 'Please enter a valid email address.';
        }
        if (first.message) {
          return first.message === 'Invalid email'
            ? 'Please enter a valid email address.'
            : first.message;
        }
      }
    } catch {
      // Normal error message
    }

    if (error.message.includes('Invalid email') || error.message.includes('email')) {
      return 'Please enter a valid email address.';
    }
    return error.message;
  }
  return 'The subscription request could not be completed.';
}

async function subscribe() {
  const resultDiv = document.getElementById('sub-result')!;
  const submitButton = document.getElementById('subscribe-btn') as HTMLButtonElement;
  const emailInput = document.getElementById('email') as HTMLInputElement;
  const alert70 = document.getElementById('alert-70') as HTMLInputElement;
  const alertAnnounced = document.getElementById('alert-announced') as HTMLInputElement;

  const email = emailInput.value.trim();

  // Client-side pre-validation
  if (!email) {
    resultDiv.textContent = 'Please enter your email address.';
    resultDiv.className = 'form-message error';
    emailInput.focus();
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    resultDiv.textContent = 'Please enter a valid email address.';
    resultDiv.className = 'form-message error';
    emailInput.focus();
    return;
  }

  if (!alert70.checked && !alertAnnounced.checked) {
    resultDiv.textContent = 'Please select at least one alert type.';
    resultDiv.className = 'form-message error';
    return;
  }

  resultDiv.textContent = 'Submitting…';
  resultDiv.className = 'form-message';
  submitButton.disabled = true;

  const payload = {
    email,
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
    resultDiv.textContent = formatErrorMessage(error);
    resultDiv.className = 'form-message error';
  } finally {
    submitButton.disabled = false;
  }
}

async function requestManagementLink() {
  const emailInput = document.getElementById('manage-email') as HTMLInputElement;
  const resultDiv = document.getElementById('manage-result')!;
  const button = document.getElementById('manage-btn') as HTMLButtonElement;

  const email = emailInput.value.trim();
  if (!email) {
    resultDiv.textContent = 'Please enter your email address.';
    resultDiv.className = 'form-message error';
    return;
  }

  resultDiv.textContent = 'Submitting…';
  resultDiv.className = 'form-message';
  button.disabled = true;

  try {
    const message = await subscriptionClient.requestManagementLink(email);
    resultDiv.textContent = `${message} Check your inbox for a secure management link.`;
    resultDiv.className = 'form-message success';
    emailInput.value = '';
  } catch (error: unknown) {
    resultDiv.textContent = formatErrorMessage(error);
    resultDiv.className = 'form-message error';
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initStatusDashboard();
  document.getElementById('subscribe-btn')?.addEventListener('click', subscribe);
  // manage-btn is hidden — only attach if present
  document.getElementById('manage-btn')?.addEventListener('click', requestManagementLink);
});
