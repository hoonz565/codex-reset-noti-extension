# API Contracts — Codex Reset Notifier

> **Version:** 1.0 (implemented contract)
>
> **Base URL (production):** `https://api.codex-reset-notifier.workers.dev` (or custom domain)
>
> **Base URL (development):** `http://localhost:8787`
>
> **Current contract:** Exactly two alert preferences, generic anti-enumeration request responses,
> hashed confirmation/management tokens, hosted confirm/manage pages, and protected admin routes.

---

## 1. CORS Policy

### Endpoint Classification

| Endpoint                                          | Class               | CORS Policy                                  |
| ------------------------------------------------- | ------------------- | -------------------------------------------- |
| `GET /api/status`                                 | Public read         | Public response; configured origins get CORS |
| `POST /api/subscriptions`                         | Public write        | Configured extension or same-origin web page |
| `POST /api/subscriptions/confirm`                 | Token-authenticated | Configured extension or same-origin web page |
| `POST /api/subscriptions/request-management-link` | Public write        | Configured extension or same-origin web page |
| `GET/PATCH /api/subscriptions/manage`             | Authenticated       | Require bearer management token              |
| `POST /api/subscriptions/unsubscribe`             | Authenticated       | Require bearer management token              |
| `GET /confirm`, `GET /manage`                     | Browser navigation  | Same-origin no-store pages                   |
| `GET /api/admin/metrics`                          | Internal            | CORS allowed origin plus admin bearer token  |
| `POST /api/admin/orchestration/run`               | Internal            | CORS allowed origin plus admin bearer token  |

### Allowed Extension Origins

```
ALLOWED_ORIGINS=chrome-extension://abc123...  (Wrangler env var, comma-separated)
```

**Rule:** CORS is not authentication. All authenticated endpoints validate the management token regardless of origin.  
**Rule:** No wildcard credentialed CORS and no cookie authentication.

### Preflight Handling

```
Access-Control-Allow-Origin: chrome-extension://<extension-id>
Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## 2. Common Response Shape

```json
{ "ok": true, ...resource fields... }
{ "ok": false, "code": "MACHINE_READABLE_CODE", "message": "Human readable.", "retryAfterSeconds": 420 }
```

**Rule:** Never expose stack traces. Never expose subscriber email in public endpoint errors. `retryAfterSeconds` only for rate limit errors.

---

## 3. Public Endpoints

### GET /api/status

**Cache headers:**

```
Cache-Control: public, max-age=60, stale-while-revalidate=300
ETag: <sha256 of response body>
```

**Response 200 (normal):**

```json
{
  "ok": true,
  "sourceHealth": "healthy",
  "status": {
    "schemaVersion": 1,
    "probability": 73,
    "lifecycle": "none",
    "resetCycleId": "cycle:2026-07-18T03:58:44.000Z",
    "latestResetAt": "2026-07-18T03:58:44.000Z",
    "announcementAt": null,
    "title": "High likelihood",
    "description": "The estimated reset likelihood is currently 73%.",
    "latestSignal": {
      "id": "2078320950488297917",
      "title": "Oops... I did it again. Enjoy reset usage limits...",
      "url": "https://x.com/thsottiaux/status/2078320950488297917",
      "publishedAt": "2026-07-18T03:28:22.000Z",
      "category": "reset_announced",
      "strength": 70
    },
    "sourceUrl": "https://www.willcodexquotareset.com/",
    "sourceUpdatedAt": "2026-07-18T05:32:04.594Z",
    "checkedAt": "2026-07-18T05:45:00.000Z",
    "statusChangedAt": "2026-07-18T03:58:44.000Z",
    "publishedAt": "2026-07-18T05:45:02.000Z",
    "sourceWarnings": [],
    "parserVersion": "1.0.0",
    "disclaimer": "Unofficial community tool. Data sourced from willcodexquotareset.com. Not affiliated with OpenAI."
  }
}
```

**Response 200 (cold start — no snapshot yet):**

> Note: Cold start now correctly returns `status: null` rather than synthesizing a fake status with null timestamps.

```json
{
  "ok": true,
  "sourceHealth": "unavailable",
  "status": null,
  "message": "No successful source check has completed yet."
}
```

---

## 4. Subscription Endpoints

### POST /api/subscriptions

**Request (exactly two preference keys):**

```json
{
  "email": "user@gmail.com",
  "preferences": {
    "probability70": true,
    "resetAnnounced": true
  },
  "installationId": "client-generated-random-id"
}
```

**Validation:**

- `email`: required and valid.
- `preferences`: required; at least one option must be `true`.
- `preferences.probability70` and `preferences.resetAnnounced`: required booleans.
- `probability90`, `resetCompleted`, and all unknown keys: rejected with 400.
- `installationId`: optional, untrusted, heuristic rate limiting only

**Response 202 (all accepted requests):**

```json
{
  "accepted": true,
  "message": "If the request is valid, it has been processed."
}
```

The response is deliberately generic to prevent account enumeration. A 24-hour confirmation token is
stored only as a hash; the raw token is sent through the configured email provider. Rate limits apply
per IP and normalized email, including a five-minute resend cooldown.

---

### POST /api/subscriptions/confirm

**Request:**

```json
{ "token": "raw-confirmation-token" }
```

**Response 200:**

```json
{
  "success": true,
  "managementToken": "new-opaque-management-token"
}
```

The confirmation token is single-use. Possession of it is required to receive the management token.

---

### GET /api/subscriptions/manage

**Authentication:** `Authorization: Bearer <managementToken>`

**Response 200:**

```json
{
  "state": "active",
  "preferences": {
    "probability70": true,
    "resetAnnounced": true
  },
  "updatedAt": "2026-07-18T10:00:00.000Z"
}
```

**Response 401:**

```json
{
  "error": "Invalid or revoked token",
  "code": "UNAUTHORIZED"
}
```

---

### PATCH /api/subscriptions/manage

**Authentication:** `Authorization: Bearer <managementToken>`

**Request (exactly two preference keys):**

```json
{
  "preferences": {
    "probability70": true,
    "resetAnnounced": false
  }
}
```

**Validation:**

1. At least one alert must be `true`
2. Unknown alert keys rejected
3. `probability90` rejected as unsupported
4. `resetCompleted` rejected as unsupported
5. Management token required — email alone cannot authorize

**Response 200:**

```json
{
  "state": "active",
  "preferences": {
    "probability70": true,
    "resetAnnounced": false
  },
  "updatedAt": "2026-07-18T10:05:00.000Z"
}
```

---

### POST /api/subscriptions/request-management-link

**Request:**

```json
{ "email": "user@gmail.com" }
```

**Response 202:**

```json
{
  "accepted": true,
  "message": "If the request is valid, it has been processed."
}
```

The response remains generic for unknown addresses. Existing subscribers receive a 30-day management
link by email; raw tokens are never returned from this endpoint.

---

### POST /api/subscriptions/unsubscribe

**Authentication:** `Authorization: Bearer <managementToken>`.

**Response 200:**

```json
{
  "success": true
}
```

---

## 5. Web Flow Endpoints

### GET /confirm?token=<raw-confirmation-token>

Returns a no-store HTML page with a confirmation button. The GET request does not mutate state, which
prevents link scanners from confirming a subscription. The page submits the token to
`POST /api/subscriptions/confirm`, then replaces its location with
`/manage?token=<new-management-token>`.

### GET /manage[?token=<raw-management-token>]

Returns the Worker-hosted management UI. Without a token, it displays the generic management-link
request form. With a valid token, it loads current preferences and supports update/unsubscribe.
Pages and their same-origin assets use a restrictive CSP, `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, and frame denial.

---

## 6. Internal/Admin Endpoints

All require `Authorization: Bearer <ADMIN_API_TOKEN>`. CORS never substitutes for authentication.

### POST /api/admin/orchestration/run

Triggers the same bounded orchestration path used by the scheduled handler.

**Response 200:**

```json
{
  "ok": true,
  "outcome": "completed",
  "runId": "run-xyz",
  "summary": {
    "sourceOutcome": "fresh_snapshot_persisted",
    "snapshotId": "snap-xyz",
    "eventsCreated": 1,
    "deliveriesPrepared": 150,
    "deliveriesSent": 25,
    "deliveriesRetried": 0,
    "deliveriesFailed": 0,
    "deliveriesCancelled": 0,
    "staleDeliveriesRecovered": 0
  }
}
```

---

## 7. Token Design

### A. Confirmation Token (one-time)

```
Generation: crypto.getRandomValues(32 bytes) → base64url
Storage: SHA-256(token) in subscription_tokens.token_hash
Expiry: 24 hours
Use: Single-use. Row is marked consumed after confirmation.
```

### B. Management Token

```
Generation: crypto.getRandomValues(32 bytes) → base64url
Storage: SHA-256(token) in subscription_tokens.token_hash
Expiry: 30 days
Rotation: At most two active management tokens; successful use retires older tokens.
Loss recovery: POST /api/subscriptions/request-management-link.
Returned: Only after valid confirmation, or delivered by email after a generic link request.
```

**Rule:** Raw tokens never stored in D1. Only hashes.

---

## 8. Rate Limit Response Format

```json
{
  "error": "Too many requests",
  "code": "RATE_LIMITED"
}
```

---

## 9. Internal Worker (Cron)

The Cron handler (`scheduled`) is the primary driver of all backend operations via `OrchestrationRunner`. It manages its own lock and time budget.

## Phase 8: API Contracts

Added GET /api/status for public UI status and GET /api/admin/metrics for operational metrics.
