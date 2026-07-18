# API Contracts — Codex Reset Notifier

> **Version:** 0.6 (Product Alignment — Two-Alert MVP)  
> **Base URL (production):** `https://api.codex-reset-notifier.workers.dev` (or custom domain)  
> **Base URL (development):** `http://localhost:8787`  
> **Changes from v0.5:** Removed `probability90` and `resetCompleted`. `GET /api/status` uses `PublicStatusResponse` wrapper. `CodexResetStatus` timestamps are strictly non-null.

---

## 1. CORS Policy

### Endpoint Classification

| Endpoint                                          | Class              | CORS Policy                                      |
| ------------------------------------------------- | ------------------ | ------------------------------------------------ |
| `GET /api/status`                                 | Public read        | Allow all origins (no credentials)               |
| `POST /api/subscriptions`                         | Public write       | Allow configured extension origin + web frontend |
| `GET /confirm`                                    | Browser navigation | No CORS needed (full page)                       |
| `GET /unsubscribe`                                | Browser navigation | No CORS needed (full page)                       |
| `GET /api/subscriptions/:id/status`               | Authenticated      | Allow extension origin, require management token |
| `PATCH /api/subscriptions/:id/preferences`        | Authenticated      | Allow extension origin, require management token |
| `POST /api/subscriptions/:id/resend-confirmation` | Authenticated      | Allow extension origin, require management token |
| `POST /api/subscriptions/:id/unsubscribe`         | Authenticated      | Allow extension origin, require management token |
| `POST /admin/*`                                   | Internal           | No browser CORS                                  |

### Allowed Extension Origins

```
CORS_ALLOWED_EXTENSION_IDS=abc123...  (Wrangler env var, comma-separated)
```

**Rule:** CORS is not authentication. All authenticated endpoints validate the management token regardless of origin.  
**Rule:** No wildcard credentialed CORS.  
**Rule:** `Access-Control-Allow-Credentials: true` only for authenticated endpoints and allowed extension origin.

### Preflight Handling

```
Access-Control-Allow-Origin: chrome-extension://<extension-id>
Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Installation-Id
Access-Control-Max-Age: 86400
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

**Request (MVP — exactly two alert keys):**

```json
{
  "email": "user@gmail.com",
  "alerts": {
    "probability70": true,
    "resetAnnounced": true
  },
  "source": "chrome_extension",
  "installationId": "client-generated-random-id"
}
```

**Validation:**

- `email`: required, valid format, ≤ 254 chars
- `alerts`: required, at least one must be `true`
- `alerts.probability70`: boolean, defaults to `true`
- `alerts.resetAnnounced`: boolean, defaults to `true`
- **`alerts.probability90`: REJECTED — unsupported field, return 400**
- **`alerts.resetCompleted`: REJECTED — unsupported field, return 400**
- Unknown alert keys: rejected with 400
- `source`: optional, max 32 chars, alphanumeric + underscore
- `installationId`: optional, untrusted, heuristic rate limiting only

**Response 201 (new subscriber):**

```json
{
  "ok": true,
  "subscription": {
    "id": "01JXYZ...",
    "state": "pending_confirmation"
  },
  "managementToken": "high-entropy-opaque-token-48-chars-minimum",
  "message": "Check your inbox to confirm your alerts."
}
```

**Response 200 (existing pending subscriber — resent confirmation):**

```json
{
  "ok": true,
  "subscription": {
    "id": "01JXYZ...",
    "state": "pending_confirmation"
  },
  "managementToken": "same-or-rotated-token",
  "message": "A new confirmation email has been sent to your address."
}
```

**Response 200 (existing active subscriber):**

```json
{
  "ok": true,
  "subscription": {
    "id": "01JXYZ...",
    "state": "active"
  },
  "message": "This email is already subscribed. Use your management token to update preferences."
}
```

**Response 400 (unsupported alert key):**

```json
{
  "ok": false,
  "code": "UNSUPPORTED_ALERT_KEY",
  "message": "The alert key 'probability90' is not supported in the current version."
}
```

**Rate limits:** 3 creates per normalized email per 24h; 3 resends per email per 30 min → 429.

---

### GET /api/subscriptions/:id/status

**Authentication:** `Authorization: Bearer <managementToken>`

**Response 200:**

```json
{
  "ok": true,
  "subscription": {
    "id": "01JXYZ...",
    "state": "active",
    "maskedEmail": "us***@gmail.com",
    "alerts": {
      "probability70": true,
      "resetAnnounced": true
    },
    "confirmedAt": "2026-07-18T10:00:00.000Z",
    "resetCycleId": "cycle:2026-07-18T03:58:44.000Z"
  }
}
```

**Response 401:**

```json
{
  "ok": false,
  "code": "INVALID_MANAGEMENT_TOKEN",
  "message": "Access denied."
}
```

---

### PATCH /api/subscriptions/:id/preferences

**Authentication:** `Authorization: Bearer <managementToken>`

**Request (exactly two preference keys):**

```json
{
  "alerts": {
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
  "ok": true,
  "subscription": {
    "id": "01JXYZ...",
    "alerts": {
      "probability70": true,
      "resetAnnounced": false
    }
  },
  "message": "Alert preferences updated."
}
```

---

### POST /api/subscriptions/:id/resend-confirmation

**Authentication:** `Authorization: Bearer <managementToken>`

**Response 200:**

```json
{
  "ok": true,
  "message": "A new confirmation email has been sent.",
  "retryAfterSeconds": 1800
}
```

**Response 429 (cooldown):**

```json
{
  "ok": false,
  "code": "CONFIRMATION_RECENTLY_SENT",
  "message": "A confirmation email was recently sent.",
  "retryAfterSeconds": 1620
}
```

---

### POST /api/subscriptions/:id/unsubscribe

**Authentication:** `Authorization: Bearer <managementToken>` OR valid signed unsubscribe link.

**Response 200:**

```json
{
  "ok": true,
  "message": "You have been unsubscribed."
}
```

---

## 5. Web Flow Endpoints

### GET /confirm?token=<raw-confirmation-token>

Returns HTML page.

**Flow:**

1. Hash the token
2. Look up `confirmation_token_hash`
3. Check expiry (`confirmation_expires_at`)
4. **Valid:** `state = active`, `confirmed_at = now`, clear token hash → success HTML
5. **Expired:** error HTML with resend option
6. **Already confirmed:** idempotent success HTML (DEF-3 note: after confirmation, `confirmed_at` is non-null; second click sees `state = active` and returns success)

---

### GET /unsubscribe?p=<payload>&s=<sig>

**Signed payload:**

```
payload = base64url({ subscriberId: "01JXYZ...", tokenVersion: 1 })
sig = HMAC-SHA256(UNSUBSCRIBE_HMAC_SECRET, payload)
```

**Flow:**

1. Verify HMAC (timing-safe)
2. Check `token_version` matches subscriber record
3. Valid: `state = unsubscribed`, render confirmation HTML
4. Invalid/tampered: generic error HTML
5. Already unsubscribed: idempotent success HTML

---

## 6. Internal/Admin Endpoints

All require `Authorization: Bearer <DISPATCH_SECRET>`. No CORS.

### POST /admin/force-crawl

Triggers an immediate source check. Calls the **same CrawlService as the Cron handler** (no logic duplication).

**Response 200:**

```json
{
  "ok": true,
  "snapshot": { "id": "...", "probability": 73, "lifecycle": "none", "sourceHealth": "healthy" },
  "eventsEmitted": ["PROBABILITY_REACHED_70"]
}
```

### POST /admin/force-bootstrap-event

Triggers subscriber event on cold start. Requires `ALLOW_BOOTSTRAP_OVERRIDE=true`.

**Request:**

```json
{
  "eventType": "RESET_ANNOUNCED",
  "reason": "Service deployed mid-reset; subscribers need notification."
}
```

### POST /admin/retry-deliveries

Retries all `failed_retryable` deliveries within max attempt count.

### GET /admin/status

Returns internal operational status (cycle info, delivery stats, last crawl).

---

## 7. Token Design

### A. Confirmation Token (one-time)

```
Generation: crypto.getRandomValues(32 bytes) → base64url
Storage: SHA-256(token) in confirmation_token_hash
Expiry: 24 hours
Use: Single-use. Hash cleared after use.
```

### B. Management Token (long-lived, extension-held)

```
Generation: crypto.getRandomValues(48 bytes) → base64url
Storage: SHA-256(token) in management_token_hash
Expiry: None (until rotated)
Rotation: Increment token_version. Old hash replaced.
Loss recovery: Re-subscribe with same email → new token issued.
Returned: ONLY on creation or explicit rotation.
```

### C. Unsubscribe Link (stateless HMAC)

```
Payload: base64url({ subscriberId, tokenVersion })
Signature: HMAC-SHA256(UNSUBSCRIBE_HMAC_SECRET, payload)
Link format: /unsubscribe?p=<payload>&s=<sig>
Invalidation: Increment token_version
Security: Timing-safe comparison. Never raw email in URL.
```

**Rule:** Raw tokens never stored in D1. Only hashes.

---

## 8. Rate Limit Response Format

```json
{
  "ok": false,
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again later.",
  "retryAfterSeconds": 1800
}
```

---

## 9. Internal Crawler → Worker (Cron)

The Cron handler IS the backend. No HTTP dispatch from crawler to Worker. The shared DISPATCH_SECRET is used only for admin HTTP endpoints.
