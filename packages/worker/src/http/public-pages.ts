const commonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function page(title: string, pageName: 'confirm' | 'manage', content: string): Response {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Codex Reset Notifier</title>
  <link rel="stylesheet" href="/public-pages.css">
</head>
<body data-page="${pageName}">
  <div class="page-wrapper">
    <header class="brand-header">
      <div class="app-icon-container" aria-hidden="true">
        <svg class="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </div>
      <div class="header-text">
        <div class="brand-title">Codex Reset Notifier</div>
        <div class="brand-subtitle">Unofficial community alerts for Codex quota-reset signals.</div>
      </div>
    </header>

    <main class="card">
      <h1 class="card-title">${title}</h1>
      ${content}
    </main>

    <footer class="page-footer">
      <p>Unofficial community tool. Not affiliated with OpenAI.</p>
    </footer>
  </div>
  <script src="/public-pages.js" defer></script>
</body>
</html>`,
    { headers: { ...commonHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

const clientScript = `(() => {
  const token = new URLSearchParams(window.location.search).get('token');
  const request = async (path, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(path, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
    return body;
  };
  const show = (id, message, error = false) => {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = message;
    node.className = error ? 'message error' : 'message success';
  };

  if (document.body.dataset.page === 'confirm') {
    const button = document.getElementById('confirm-button');
    if (!token) {
      button.disabled = true;
      show('confirm-message', 'This confirmation link is incomplete or missing a token.', true);
      return;
    }
    button.addEventListener('click', async () => {
      button.disabled = true;
      show('confirm-message', 'Confirming…');
      try {
        const result = await request('/api/subscriptions/confirm', {
          method: 'POST', body: JSON.stringify({ token })
        });
        if (!result.managementToken) throw new Error('The server returned an invalid response.');
        window.location.replace('/manage?token=' + encodeURIComponent(result.managementToken));
      } catch (error) {
        show('confirm-message', error.message, true);
        button.disabled = false;
      }
    });
    return;
  }

  const requestPanel = document.getElementById('request-panel');
  const managePanel = document.getElementById('manage-panel');
  const loadManagement = async () => {
    if (!token) return;
    requestPanel.hidden = true;
    managePanel.hidden = false;
    try {
      const info = await request('/api/subscriptions/manage');
      document.getElementById('probability70').checked = info.preferences.probability70;
      document.getElementById('resetAnnounced').checked = info.preferences.resetAnnounced;
      show('manage-message', 'Subscription preferences loaded.');
    } catch (error) {
      managePanel.hidden = true;
      requestPanel.hidden = false;
      show('request-message', error.message, true);
    }
  };

  document.getElementById('request-button')?.addEventListener('click', async () => {
    const email = document.getElementById('request-email')?.value;
    try {
      const result = await request('/api/subscriptions/request-management-link', {
        method: 'POST', body: JSON.stringify({ email })
      });
      show('request-message', result.message + ' Check your inbox.');
    } catch (error) { show('request-message', error.message, true); }
  });

  document.getElementById('save-button')?.addEventListener('click', async () => {
    const preferences = {
      probability70: document.getElementById('probability70').checked,
      resetAnnounced: document.getElementById('resetAnnounced').checked
    };
    if (!preferences.probability70 && !preferences.resetAnnounced) {
      show('manage-message', 'Select at least one alert or unsubscribe.', true);
      return;
    }
    try {
      await request('/api/subscriptions/manage', {
        method: 'PATCH', body: JSON.stringify({ preferences })
      });
      show('manage-message', 'Preferences saved successfully.');
    } catch (error) { show('manage-message', error.message, true); }
  });

  document.getElementById('unsubscribe-button')?.addEventListener('click', async () => {
    try {
      await request('/api/subscriptions/unsubscribe', { method: 'POST' });
      show('manage-message', 'You have been unsubscribed successfully.');
      document.getElementById('save-button').disabled = true;
      document.getElementById('unsubscribe-button').disabled = true;
    } catch (error) { show('manage-message', error.message, true); }
  });

  loadManagement();
})();`;

const styles = `
:root {
  --surface-page: #F7FAFF;
  --surface-card: #FFFFFF;
  --blue-50: #EFF6FF;
  --blue-100: #DBEAFE;
  --blue-600: #2563EB;
  --blue-700: #1D4ED8;
  --navy-900: #172554;
  --text-primary: #172554;
  --text-secondary: #64748B;
  --text-muted: #94A3B8;
  --border-default: #E2E8F0;
  --border-blue: #D7E5FA;
  --success: #16A34A;
  --success-bg: #ECFDF5;
  --success-border: #D1FAE5;
  --danger: #DC2626;
  --danger-bg: #FEF2F2;
  --danger-border: #FEE2E2;
  --radius-card: 16px;
  --radius-control: 10px;
}

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-page);
  color: var(--text-primary);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.page-wrapper {
  width: 100%;
  max-width: 460px;
  padding: 32px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.brand-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  width: 100%;
}

.app-icon-container {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #FFFFFF;
  border: 1px solid var(--border-blue);
  box-shadow: 0 1px 3px rgba(37, 99, 235, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.app-icon {
  width: 22px;
  height: 22px;
  color: var(--blue-600);
}

.header-text {
  display: flex;
  flex-direction: column;
}

.brand-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.015em;
  line-height: 1.2;
}

.brand-subtitle {
  font-size: 0.78rem;
  font-weight: 450;
  color: var(--text-secondary);
  line-height: 1.3;
  margin-top: 2px;
}

.card {
  width: 100%;
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-card);
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(15, 23, 42, 0.02);
  padding: 28px 24px;
}

.card-title {
  margin: 0 0 8px;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.015em;
}

.card-desc {
  margin: 0 0 18px;
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.45;
}

.alert-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

.alert-option-row {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-control);
  background: #FAFBFC;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.alert-option-row:hover {
  background: #F1F5F9;
  border-color: #CBD5E1;
}

.alert-option-row input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--blue-600);
  cursor: pointer;
  margin: 0;
}

.alert-option-label {
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--text-primary);
  user-select: none;
}

.input-group {
  margin-bottom: 16px;
}

.input-label {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 5px;
}

.input-field {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-control);
  font-size: 0.88rem;
  color: var(--text-primary);
  background: #FFFFFF;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.input-field:focus {
  border-color: var(--blue-600);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.button-group {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}

.btn-primary {
  flex: 1;
  height: 40px;
  background: var(--blue-600);
  color: #FFFFFF;
  border: none;
  border-radius: var(--radius-control);
  font-size: 0.88rem;
  font-weight: 650;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background-color 0.15s ease, transform 0.1s ease;
}

.btn-primary:hover {
  background: var(--blue-700);
}

.btn-primary:active {
  background: #1E40AF;
  transform: scale(0.99);
}

.btn-primary:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  transform: none;
}

.btn-danger {
  height: 40px;
  padding: 0 16px;
  background: var(--danger-bg);
  color: var(--danger);
  border: 1px solid var(--danger-border);
  border-radius: var(--radius-control);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.btn-danger:hover {
  background: #FEE2E2;
}

.btn-danger:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.message {
  min-height: 0;
  margin-top: 14px;
  font-size: 0.84rem;
  line-height: 1.4;
  padding: 0;
  border-radius: 8px;
}

.message.success {
  padding: 8px 12px;
  background: var(--success-bg);
  color: var(--success);
  border: 1px solid var(--success-border);
}

.message.error {
  padding: 8px 12px;
  background: var(--danger-bg);
  color: var(--danger);
  border: 1px solid var(--danger-border);
}

.page-footer {
  margin-top: 20px;
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-muted);
}

[hidden] {
  display: none !important;
}
`;

export function handlePublicPage(request: Request): Response | null {
  const { pathname } = new URL(request.url);
  if (request.method !== 'GET') return null;

  if (pathname === '/confirm') {
    return page(
      'Confirm your alerts',
      'confirm',
      `<p class="card-desc">Click below to activate your email alerts for OpenAI Codex quota reset cycles.</p>
      <button id="confirm-button" class="btn-primary" type="button">Confirm alerts</button>
      <p id="confirm-message" class="message" role="status" aria-live="polite"></p>`
    );
  }
  if (pathname === '/manage') {
    return page(
      'Manage your alerts',
      'manage',
      `<section id="request-panel">
        <p class="card-desc">Enter your email address to receive a secure link to manage your alert preferences.</p>
        <div class="input-group">
          <label for="request-email" class="input-label">Email address</label>
          <input id="request-email" class="input-field" type="email" autocomplete="email" placeholder="you@example.com" required>
        </div>
        <button id="request-button" class="btn-primary" type="button">Email me a secure link</button>
        <p id="request-message" class="message" role="status" aria-live="polite"></p>
      </section>
      <section id="manage-panel" hidden>
        <p class="card-desc">Select the alert triggers you wish to receive for your email subscription.</p>
        <div class="alert-options">
          <label class="alert-option-row" for="probability70">
            <input id="probability70" type="checkbox">
            <span class="alert-option-label">Likelihood reaches 70%</span>
          </label>
          <label class="alert-option-row" for="resetAnnounced">
            <input id="resetAnnounced" type="checkbox">
            <span class="alert-option-label">A reset is announced</span>
          </label>
        </div>
        <div class="button-group">
          <button id="save-button" class="btn-primary" type="button">Save preferences</button>
          <button id="unsubscribe-button" class="btn-danger" type="button">Unsubscribe</button>
        </div>
        <p id="manage-message" class="message" role="status" aria-live="polite"></p>
      </section>`
    );
  }
  if (pathname === '/public-pages.js') {
    return new Response(clientScript, {
      headers: { ...commonHeaders, 'Content-Type': 'text/javascript; charset=utf-8' },
    });
  }
  if (pathname === '/public-pages.css') {
    return new Response(styles, {
      headers: { ...commonHeaders, 'Content-Type': 'text/css; charset=utf-8' },
    });
  }
  if (pathname === '/privacy') {
    return new Response(
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Privacy Policy — Codex Reset Notifier</title>
  <style>
    :root { color-scheme: light; font-family: Inter, system-ui, -apple-system, sans-serif; color: #172554; background: #F7FAFF; }
    body { margin: 0; padding: 32px 16px; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    main { box-sizing: border-box; max-width: 680px; width: 100%; margin: 0 auto; padding: 32px; border: 1px solid #E2E8F0; border-radius: 16px; background: white; box-shadow: 0 4px 20px rgba(15,23,42,.06); }
    h1 { margin-top: 0; font-size: 1.5rem; color: #172554; }
    h2 { font-size: 1.05rem; margin-top: 1.8rem; color: #172554; }
    p, li { line-height: 1.6; color: #475569; font-size: 0.9rem; }
    a { color: #2563EB; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
    .updated { color: #94A3B8; font-size: .8rem; }
  </style>
</head>
<body>
  <main>
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: 2026-09-01</p>
    <p>Codex Reset Notifier (&ldquo;the Extension&rdquo;, &ldquo;the Service&rdquo;) is an unofficial community tool that monitors the Codex quota reset cycle and sends email notifications. It is not affiliated with OpenAI.</p>

    <h2>1. What data we collect</h2>
    <p>We collect only your <strong>email address</strong>, provided voluntarily when you subscribe for reset notifications. No other personal data is collected.</p>

    <h2>2. How we use your data</h2>
    <p>Your email address is used exclusively to send you the notification types you selected:</p>
    <ul>
      <li>When the Codex reset probability reaches 70%</li>
      <li>When a Codex reset is officially announced</li>
    </ul>
    <p>We do not use your email for marketing, profiling, or any other purpose.</p>

    <h2>3. Data storage</h2>
    <p>Your email address is stored securely in a Cloudflare D1 SQL database. It is stored only for as long as your subscription is active.</p>

    <h2>4. Data sharing</h2>
    <p>We do not sell, rent, or share your personal data with any third party, except that email delivery is performed via <a href="https://resend.com/privacy" rel="noopener">Resend</a> (our transactional email provider), solely for the purpose of delivering your notifications.</p>

    <h2>5. Your rights</h2>
    <p>You may unsubscribe and delete your data at any time by visiting the <a href="/manage">subscription management page</a> and clicking &ldquo;Unsubscribe&rdquo;. This immediately and permanently deletes your email address from our systems.</p>

    <h2>6. Extension permissions</h2>
    <p>The Chrome Extension requests network access solely to communicate with the Codex Reset Notifier Worker API to fetch reset status and manage subscriptions. No other hosts are accessed.</p>

    <h2>7. Contact</h2>
    <p>For privacy questions, contact us at <a href="mailto:alerts@notidex.click">alerts@notidex.click</a>.</p>

    <p class="updated">This is an unofficial community tool. Not affiliated with OpenAI.</p>
  </main>
</body>
</html>`,
      {
        headers: {
          ...commonHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=86400',
        },
      }
    );
  }
  return null;
}
