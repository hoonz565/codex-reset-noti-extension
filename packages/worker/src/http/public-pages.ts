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
  <title>${title}</title>
  <link rel="stylesheet" href="/public-pages.css">
</head>
<body data-page="${pageName}">
  <main>
    <h1>${title}</h1>
    ${content}
    <p class="disclaimer">Unofficial community tool. Not affiliated with OpenAI.</p>
  </main>
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
      show('confirm-message', 'This confirmation link is incomplete.', true);
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
      show('manage-message', 'Subscription loaded.');
    } catch (error) {
      managePanel.hidden = true;
      requestPanel.hidden = false;
      show('request-message', error.message, true);
    }
  };

  document.getElementById('request-button').addEventListener('click', async () => {
    const email = document.getElementById('request-email').value;
    try {
      const result = await request('/api/subscriptions/request-management-link', {
        method: 'POST', body: JSON.stringify({ email })
      });
      show('request-message', result.message + ' Check your inbox.');
    } catch (error) { show('request-message', error.message, true); }
  });

  document.getElementById('save-button').addEventListener('click', async () => {
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
      show('manage-message', 'Preferences saved.');
    } catch (error) { show('manage-message', error.message, true); }
  });

  document.getElementById('unsubscribe-button').addEventListener('click', async () => {
    try {
      await request('/api/subscriptions/unsubscribe', { method: 'POST' });
      show('manage-message', 'You have been unsubscribed.');
      document.getElementById('save-button').disabled = true;
      document.getElementById('unsubscribe-button').disabled = true;
    } catch (error) { show('manage-message', error.message, true); }
  });

  loadManagement();
})();`;

const styles = `
:root { color-scheme: light; font-family: system-ui, sans-serif; color: #172033; background: #f4f7fb; }
body { margin: 0; padding: 32px 16px; }
main { box-sizing: border-box; max-width: 560px; margin: 0 auto; padding: 28px; border: 1px solid #d7dde5; border-radius: 12px; background: white; box-shadow: 0 10px 30px rgba(23,32,51,.08); }
h1 { margin-top: 0; }
label { display: block; margin: 12px 0 5px; }
label.choice { font-weight: 500; }
input[type=email] { box-sizing: border-box; width: 100%; padding: 10px; border: 1px solid #9aa6b8; border-radius: 6px; }
button { margin-top: 14px; padding: 10px 14px; border: 0; border-radius: 6px; color: white; background: #175cd3; cursor: pointer; font-weight: 650; }
button.danger { background: #b42318; margin-left: 8px; }
button:disabled { opacity: .6; cursor: default; }
.message { min-height: 1.3em; margin-top: 12px; }
.success { color: #067647; }
.error { color: #b42318; }
.disclaimer { margin-top: 28px; color: #667085; font-size: .8rem; }
[hidden] { display: none !important; }
`;

export function handlePublicPage(request: Request): Response | null {
  const { pathname } = new URL(request.url);
  if (request.method !== 'GET') return null;

  if (pathname === '/confirm') {
    return page(
      'Confirm your alerts',
      'confirm',
      '<p>Confirm that you want to receive the two alert types you selected.</p><button id="confirm-button" type="button">Confirm alerts</button><p id="confirm-message" class="message" role="status" aria-live="polite"></p>'
    );
  }
  if (pathname === '/manage') {
    return page(
      'Manage your alerts',
      'manage',
      '<section id="request-panel"><p>Request a secure management link by email.</p><label for="request-email">Email address</label><input id="request-email" type="email" autocomplete="email" required><button id="request-button" type="button">Email me a secure link</button><p id="request-message" class="message" role="status" aria-live="polite"></p></section><section id="manage-panel" hidden><label class="choice"><input id="probability70" type="checkbox"> Likelihood reaches 70%</label><label class="choice"><input id="resetAnnounced" type="checkbox"> A reset is announced</label><button id="save-button" type="button">Save preferences</button><button id="unsubscribe-button" class="danger" type="button">Unsubscribe</button><p id="manage-message" class="message" role="status" aria-live="polite"></p></section>'
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
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #172033; background: #f4f7fb; }
    body { margin: 0; padding: 32px 16px; }
    main { box-sizing: border-box; max-width: 720px; margin: 0 auto; padding: 32px; border: 1px solid #d7dde5; border-radius: 12px; background: white; box-shadow: 0 10px 30px rgba(23,32,51,.08); }
    h1 { margin-top: 0; font-size: 1.6rem; }
    h2 { font-size: 1.1rem; margin-top: 2rem; }
    p, li { line-height: 1.65; color: #344054; }
    a { color: #175cd3; }
    .updated { color: #667085; font-size: .85rem; }
  </style>
</head>
<body>
  <main>
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: 2026-08-31</p>
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
    <p>Your email address is stored in a Cloudflare D1 database hosted in the APAC region. It is stored only for as long as your subscription is active.</p>

    <h2>4. Data sharing</h2>
    <p>We do not sell, rent, or share your personal data with any third party, except that email delivery is performed via <a href="https://resend.com/privacy" rel="noopener">Resend</a> (our transactional email provider), solely for the purpose of delivering your notifications.</p>

    <h2>5. Your rights</h2>
    <p>You may unsubscribe and delete your data at any time by visiting the <a href="/manage">subscription management page</a> and clicking &ldquo;Unsubscribe&rdquo;. This immediately and permanently deletes your email address from our systems.</p>

    <h2>6. Extension permissions</h2>
    <p>The Chrome Extension requests network access solely to communicate with the Codex Reset Notifier Worker API (<code>codex-reset-notifier.nguyenminhhung05062005.workers.dev</code>) to fetch reset status and manage subscriptions. No other hosts are accessed.</p>

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
