import { publicStatusResponseSchema, createSubscriptionRequestSchema } from '@codex-reset/shared';

const API_BASE = 'http://127.0.0.1:8787';

async function fetchStatus() {
  const container = document.getElementById('status-container')!;
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    if (!res.ok) throw new Error('Network response was not ok');

    const data = await res.json();
    const parsed = publicStatusResponseSchema.parse(data);

    if (parsed.status) {
      container.textContent = `Probability: ${parsed.status.probability}% | Lifecycle: ${parsed.status.title} | Health: ${parsed.sourceHealth}`;
    } else {
      container.textContent = `Cold start. Health: ${parsed.sourceHealth}`;
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    container.textContent = `Failed to load status: ${msg}`;
    container.className = 'status error';
  }
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
    }
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
  fetchStatus();
  document.getElementById('subscribe-btn')?.addEventListener('click', subscribe);
});
