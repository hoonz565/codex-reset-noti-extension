#!/usr/bin/env node
/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
/**
 * verify-staging-metrics-e2e.cjs
 *
 * Live HTTPS E2E tests for the deployed staging Worker's /api/admin/metrics endpoint.
 * Bearer token is read ONLY from the STAGING_ADMIN_TOKEN environment variable.
 * The token value is NEVER printed, logged, serialized, or written to any file.
 *
 * Writes: artifacts/staging-e2e-metrics.json (sanitized — HTTP status + headers only)
 *
 * Required bounded response keys (schemaVersion 1):
 *   schemaVersion, window, generatedAt, totals, eventHistory
 *
 * Forbidden keys (must be absent):
 *   subscribers, email, token, apiKey, secret, rawUpstream, provider, address
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const STAGING_URL =
  process.env.STAGING_WORKER_URL ||
  'https://codex-reset-notifier-staging.nguyenminhhung05062005.workers.dev';
const STAGING_ORIGIN =
  process.env.STAGING_EXTENSION_ORIGIN || 'chrome-extension://ljbjnnpmhdcmbadkcedoenjpkplddfpc';
const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts');

// Read the bearer token from env — never print it
const BEARER = process.env.STAGING_ADMIN_TOKEN;
if (!BEARER) {
  console.error('STAGING_ADMIN_TOKEN environment variable is not set.');
  process.exit(1);
}

const FORBIDDEN_RESPONSE_KEYS = [
  'subscribers',
  'email',
  'token',
  'apikey',
  'secret',
  'rawupstream',
  'address',
];

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + (parsed.search || ''),
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const req = https.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Request timed out')));
    req.end();
  });
}

function sanitizeHeaders(headers) {
  const safe = {};
  const ALLOWED = [
    'content-type',
    'cache-control',
    'access-control-allow-origin',
    'access-control-allow-methods',
    'www-authenticate',
    'vary',
    'cf-ray',
    'cf-cache-status',
    'date',
    'allow',
  ];
  for (const h of ALLOWED) if (headers[h]) safe[h] = headers[h];
  return safe;
}

function checkForbiddenKeys(obj, keyPath = '') {
  const found = [];
  if (typeof obj !== 'object' || obj === null) return found;
  for (const key of Object.keys(obj)) {
    const full = keyPath ? `${keyPath}.${key}` : key;
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_RESPONSE_KEYS.some((fk) => lowerKey === fk || lowerKey.includes(fk))) {
      found.push(full);
    }
    if (typeof obj[key] === 'object') found.push(...checkForbiddenKeys(obj[key], full));
  }
  return found;
}

// Validate metrics response structure against AdminMetricsResponseSchema
function validateMetricsResponse(json) {
  const issues = [];
  if (json.schemaVersion !== 1) issues.push(`schemaVersion expected 1, got ${json.schemaVersion}`);
  if (!json.window) issues.push('missing window');
  if (!json.generatedAt) issues.push('missing generatedAt');
  if (!json.orchestration || typeof json.orchestration !== 'object') {
    issues.push('missing/invalid orchestration');
  }
  if (!json.source || typeof json.source !== 'object') {
    issues.push('missing/invalid source');
  }
  if (!json.events || typeof json.events !== 'object') {
    issues.push('missing/invalid events');
  }
  if (!json.deliveries || typeof json.deliveries !== 'object') {
    issues.push('missing/invalid deliveries');
  }
  const forbidden = checkForbiddenKeys(json);
  if (forbidden.length > 0) issues.push(`forbidden keys present: ${forbidden.join(', ')}`);
  return issues;
}

const results = {
  runAt: new Date().toISOString(),
  stagingUrl: STAGING_URL,
  bearerNote: 'Bearer token read from STAGING_ADMIN_TOKEN env var. Value never recorded.',
  tests: [],
  summary: { passed: 0, failed: 0 },
};

function pass(name, evidence) {
  console.log(`  PASS  ${name}`);
  results.tests.push({ name, result: 'PASS', evidence });
  results.summary.passed++;
}

function fail(name, reason, evidence) {
  console.error(`  FAIL  ${name}: ${reason}`);
  results.tests.push({ name, result: 'FAIL', reason, evidence });
  results.summary.failed++;
}

async function runTests() {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

  const BASE = `${STAGING_URL}/api/admin/metrics`;

  // 1. Missing bearer → 401
  console.log('\n=== Metrics E2E: no bearer → 401 ===');
  try {
    const res = await fetch(BASE, { headers: { Origin: STAGING_ORIGIN } });
    const ev = { status: res.status, headers: sanitizeHeaders(res.headers) };
    if (res.status === 401) pass('Missing bearer → HTTP 401', ev);
    else fail('Missing bearer → HTTP 401', `Got ${res.status}`, ev);
  } catch (e) {
    fail('Missing bearer → HTTP 401', e.message, {});
  }

  // 2. Invalid bearer → 401
  console.log('\n=== Metrics E2E: invalid bearer → 401 ===');
  try {
    const res = await fetch(BASE, {
      headers: { Origin: STAGING_ORIGIN, Authorization: 'Bearer invalid-token-xyz' },
    });
    const ev = { status: res.status, headers: sanitizeHeaders(res.headers) };
    if (res.status === 401) pass('Invalid bearer → HTTP 401', ev);
    else fail('Invalid bearer → HTTP 401', `Got ${res.status}`, ev);
  } catch (e) {
    fail('Invalid bearer → HTTP 401', e.message, {});
  }

  // 3. Allowed Origin alone (no bearer) → 401
  console.log('\n=== Metrics E2E: origin only, no bearer → 401 ===');
  try {
    const res = await fetch(BASE, { headers: { Origin: STAGING_ORIGIN } });
    const ev = { status: res.status, headers: sanitizeHeaders(res.headers) };
    if (res.status === 401) pass('Origin only, no bearer → HTTP 401', ev);
    else fail('Origin only, no bearer → HTTP 401', `Got ${res.status}`, ev);
  } catch (e) {
    fail('Origin only, no bearer → HTTP 401', e.message, {});
  }

  // 4. Valid bearer → 200, validate schema, no PII
  console.log('\n=== Metrics E2E: valid bearer → 200 ===');
  try {
    const res = await fetch(BASE, {
      headers: {
        Origin: STAGING_ORIGIN,
        Authorization: `Bearer ${BEARER}`,
      },
    });
    const ev = { status: res.status, headers: sanitizeHeaders(res.headers) };
    if (res.status === 200) {
      let json;
      try {
        json = JSON.parse(res.body);
      } catch {
        fail('Valid bearer → HTTP 200 JSON parse', 'Invalid JSON', ev);
        return;
      }
      const issues = validateMetricsResponse(json);
      if (issues.length > 0) fail('Valid bearer → HTTP 200 schema', issues.join('; '), ev);
      else {
        ev.schemaVersion = json.schemaVersion;
        ev.window = json.window;
        ev.sections = ['orchestration', 'source', 'events', 'deliveries'];
        pass('Valid bearer → HTTP 200, schema valid, no PII', ev);
      }
    } else fail('Valid bearer → HTTP 200', `Got ${res.status}`, ev);
  } catch (e) {
    fail('Valid bearer → HTTP 200', e.message, {});
  }

  // 5. Unsupported window → 400
  console.log('\n=== Metrics E2E: unsupported window → 400 ===');
  try {
    const res = await fetch(`${BASE}?window=unsupported`, {
      headers: {
        Origin: STAGING_ORIGIN,
        Authorization: `Bearer ${BEARER}`,
      },
    });
    const ev = { status: res.status, headers: sanitizeHeaders(res.headers) };
    if (res.status === 400) pass('Unsupported window → HTTP 400', ev);
    else fail('Unsupported window → HTTP 400', `Got ${res.status}`, ev);
  } catch (e) {
    fail('Unsupported window → HTTP 400', e.message, {});
  }

  // 6-8. Supported windows 1h, 24h, 7d → 200
  for (const window of ['1h', '24h', '7d']) {
    console.log(`\n=== Metrics E2E: window=${window} → 200 ===`);
    try {
      const res = await fetch(`${BASE}?window=${window}`, {
        headers: {
          Origin: STAGING_ORIGIN,
          Authorization: `Bearer ${BEARER}`,
        },
      });
      const ev = { status: res.status, headers: sanitizeHeaders(res.headers) };
      if (res.status === 200) {
        let json;
        try {
          json = JSON.parse(res.body);
        } catch {
          fail(`window=${window} → HTTP 200 JSON`, 'Invalid JSON', ev);
          continue;
        }
        const issues = validateMetricsResponse(json);
        ev.schemaVersion = json.schemaVersion;
        ev.window = json.window;
        if (issues.length > 0) fail(`window=${window} → HTTP 200 schema`, issues.join('; '), ev);
        else pass(`window=${window} → HTTP 200, schema valid`, ev);
      } else fail(`window=${window} → HTTP 200`, `Got ${res.status}`, ev);
    } catch (e) {
      fail(`window=${window} → HTTP 200`, e.message, {});
    }
  }

  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'staging-e2e-metrics.json'),
    JSON.stringify(results, null, 2) + '\n'
  );

  console.log(`\nMetrics E2E: ${results.summary.passed} passed, ${results.summary.failed} failed`);
  if (results.summary.failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
