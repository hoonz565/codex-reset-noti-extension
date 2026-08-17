#!/usr/bin/env node
/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
/**
 * verify-staging-e2e.cjs
 *
 * Live HTTPS E2E tests for the deployed staging Worker's public /api/status endpoint.
 * All assertions run against the real deployed URL — no in-process handlers.
 *
 * Writes: artifacts/staging-e2e-status.json
 *
 * Required keys in StatusApiResponse (schemaVersion 1):
 *   schemaVersion, status.state, status.probability,
 *   status.lastKnownProbability, status.lastKnownObservedAt,
 *   status.resetAnnounced, status.latestResetAt, status.latestResetObservedAt
 *
 * Forbidden keys (must be absent):
 *   subscribers, email, token, apiKey, secret, rawUpstream, provider
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
const FORBIDDEN_ORIGIN = 'https://evil.example.com';
const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts');

const REQUIRED_STATUS_KEYS = ['schemaVersion', 'status'];
const REQUIRED_STATUS_INNER_KEYS = [
  'state',
  'probability',
  'lastKnownProbability',
  'lastKnownObservedAt',
  'resetAnnounced',
  'latestResetAt',
  'resetCycleId',
  'checkedAt',
];
const FORBIDDEN_KEYS = [
  'subscribers',
  'email',
  'token',
  'apiKey',
  'secret',
  'rawUpstream',
  'provider',
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
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Request timed out'));
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

function sanitizeHeaders(headers) {
  const safe = {};
  const ALLOWED_HEADERS = [
    'content-type',
    'cache-control',
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-max-age',
    'vary',
    'x-content-type-options',
    'cf-ray',
    'cf-cache-status',
    'date',
    'allow',
  ];
  for (const h of ALLOWED_HEADERS) {
    if (headers[h] !== undefined) safe[h] = headers[h];
  }
  return safe;
}

function checkForbiddenKeys(obj, path = '') {
  const found = [];
  if (typeof obj !== 'object' || obj === null) return found;
  for (const key of Object.keys(obj)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEYS.some((fk) => key.toLowerCase().includes(fk.toLowerCase()))) {
      found.push(fullPath);
    }
    if (typeof obj[key] === 'object') {
      found.push(...checkForbiddenKeys(obj[key], fullPath));
    }
  }
  return found;
}

const results = {
  runAt: new Date().toISOString(),
  stagingUrl: STAGING_URL,
  stagingOrigin: STAGING_ORIGIN,
  corsNote:
    'Contract verification only — real Chrome extension origin NOT VERIFIED. Blocking input: actual staging extension ID.',
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

  console.log('\n=== Live Status E2E: GET /api/status (staging origin) ===');
  try {
    const res = await fetch(`${STAGING_URL}/api/status`, {
      headers: { Origin: STAGING_ORIGIN },
    });
    const evidence = {
      status: res.status,
      headers: sanitizeHeaders(res.headers),
    };
    if (res.status !== 200) {
      fail('GET /api/status — HTTP 200', `Expected 200, got ${res.status}`, evidence);
    } else {
      let json;
      try {
        json = JSON.parse(res.body);
      } catch {
        fail('GET /api/status — JSON parse', 'Invalid JSON', evidence);
        return;
      }

      const schemaOk = json.schemaVersion === 1;
      const hasRequiredKeys = REQUIRED_STATUS_KEYS.every((k) => k in json);
      const hasInnerKeys = json.status && REQUIRED_STATUS_INNER_KEYS.every((k) => k in json.status);
      const forbiddenFound = checkForbiddenKeys(json);
      const cacheControl = res.headers['cache-control'] || '';
      const cacheOk = cacheControl.length > 0;

      evidence.schemaVersion = json.schemaVersion;
      evidence.statusState = json.status?.state;
      evidence.cacheControl = cacheControl;
      evidence.corsHeader = res.headers['access-control-allow-origin'] || 'absent';

      if (!schemaOk)
        fail('GET /api/status — schemaVersion', `Expected 1, got ${json.schemaVersion}`, evidence);
      else if (!hasRequiredKeys)
        fail('GET /api/status — required keys', `Missing top-level keys`, evidence);
      else if (!hasInnerKeys)
        fail('GET /api/status — inner status keys', `Missing status.* keys`, evidence);
      else if (forbiddenFound.length > 0)
        fail('GET /api/status — forbidden keys', `Found: ${forbiddenFound.join(', ')}`, evidence);
      else if (!cacheOk)
        fail('GET /api/status — Cache-Control', 'Cache-Control header absent', evidence);
      else pass('GET /api/status — HTTP 200, schema, keys, no PII, Cache-Control', evidence);
    }
  } catch (e) {
    fail('GET /api/status', e.message, {});
  }

  console.log('\n=== Live Status E2E: OPTIONS /api/status (staging origin) ===');
  try {
    const res = await fetch(`${STAGING_URL}/api/status`, {
      method: 'OPTIONS',
      headers: { Origin: STAGING_ORIGIN, 'Access-Control-Request-Method': 'GET' },
    });
    const evidence = { status: res.status, headers: sanitizeHeaders(res.headers) };
    const hasAllowOrigin = !!res.headers['access-control-allow-origin'];
    const hasAllowMethods = !!res.headers['access-control-allow-methods'];
    if (res.status !== 204) fail('OPTIONS /api/status — HTTP 204', `Got ${res.status}`, evidence);
    else if (!hasAllowOrigin)
      fail('OPTIONS /api/status — ACAO header', 'Missing Access-Control-Allow-Origin', evidence);
    else if (!hasAllowMethods)
      fail('OPTIONS /api/status — ACAM header', 'Missing Access-Control-Allow-Methods', evidence);
    else pass('OPTIONS /api/status — HTTP 204, CORS headers present', evidence);
  } catch (e) {
    fail('OPTIONS /api/status', e.message, {});
  }

  console.log('\n=== Live Status E2E: GET /api/status (forbidden origin) ===');
  try {
    const res = await fetch(`${STAGING_URL}/api/status`, {
      headers: { Origin: FORBIDDEN_ORIGIN },
    });
    const evidence = { status: res.status, headers: sanitizeHeaders(res.headers) };
    if (res.status !== 403)
      fail('GET /api/status forbidden origin — HTTP 403', `Got ${res.status}`, evidence);
    else pass('GET /api/status forbidden origin — HTTP 403 rejected', evidence);
  } catch (e) {
    fail('GET /api/status forbidden origin', e.message, {});
  }

  console.log('\n=== Live Status E2E: POST /api/status ===');
  try {
    const res = await fetch(`${STAGING_URL}/api/status`, {
      method: 'POST',
      headers: { Origin: STAGING_ORIGIN, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const evidence = { status: res.status, headers: sanitizeHeaders(res.headers) };
    if (res.status !== 405) fail('POST /api/status — HTTP 405', `Got ${res.status}`, evidence);
    else pass('POST /api/status — HTTP 405 method not allowed', evidence);
  } catch (e) {
    fail('POST /api/status', e.message, {});
  }

  // Write results
  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'staging-e2e-status.json'),
    JSON.stringify(results, null, 2) + '\n'
  );

  console.log(`\nStatus E2E: ${results.summary.passed} passed, ${results.summary.failed} failed`);
  if (results.summary.failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
