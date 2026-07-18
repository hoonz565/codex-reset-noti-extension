# Source Analysis — willcodexquotareset.com

> **Status:** PHASE 0 complete — corrected in Phase 0.5  
> **Analyst:** Codex Reset Notifier — Senior Tech Lead  
> **Date:** 2026-07-18  
> **Verdict:** ✅ FEASIBLE — JSON endpoint discovered in client-side JS, no scraping required  
> **⚠️ DISCLAIMER:** `/api/forecast` is NOT a documented or officially supported public API. It was discovered by reading client-side JavaScript. It may change, disappear, or add authentication without notice. All parsing must be strictly validated at runtime.

---

## 1. Source Overview

- **URL:** https://www.willcodexquotareset.com/
- **Type:** Static SPA — HTML shell + client-side JavaScript
- **robots.txt:** 404 (no robots.txt — no explicit crawling restrictions)
- **Underlying data:** Fully available via a **public JSON API endpoint**

---

## 2. Data Source Discovery

Investigation order per spec (API → embedded JSON → structured data → HTML):

| Priority | Method                             | Result                                       |
| -------- | ---------------------------------- | -------------------------------------------- |
| 1        | Public JSON/API endpoint           | ✅ **FOUND** — `/api/forecast`               |
| 2        | Embedded JSON (`__NEXT_DATA__`)    | ❌ Not present                               |
| 3        | Structured data in `<script>` tags | ❌ Not present                               |
| 4        | HTML text / CSS selectors          | ⚠️ All values injected by JS — fallback only |
| 5        | Browser automation                 | ❌ Not needed                                |

### Key Finding

The JavaScript source (`script.js`) reveals:

```javascript
const FORECAST_API_URL = '/api/forecast';
```

This is the **single source of truth** for all data rendered on the page. The HTML is a shell; all meaningful fields arrive from this endpoint.

---

## 3. API Endpoint Details

### Endpoint

```
GET https://www.willcodexquotareset.com/api/forecast
Accept: application/json
```

### Response Fields (confirmed live, 2026-07-18)

```json
{
  "fetchedAt": "2026-07-18T05:32:04.594Z",
  "nextRefreshAt": "2026-07-18T06:02:04.594Z",
  "refreshCount": 1,

  "forecast": {
    "score": 30,
    "resetAnnounced": false,
    "daysSinceReset": 0,
    "hoursSinceReset": 1.55,
    "hoursSinceResetAnnouncement": null,
    "latestResetAt": "2026-07-18T03:58:44.000Z",
    "breakdown": [
      { "label": "baseline", "points": 12 },
      { "label": "LLM tweet-context judgment", "points": 18 }
    ],
    "aggregateAssessment": {
      "resetIntent": "plausible",
      "scoreImpact": 18,
      "cooldownApplies": false,
      "reason": "...",
      "supportingGuids": ["..."]
    }
  },

  "incidents": [
    {
      "id": "...",
      "name": "Codex 5.6-sol Experiencing Increased Server-Overload Errors",
      "status": "resolved",
      "created_at": "2026-07-17T17:19:22Z",
      "updated_at": "...",
      "impact": "none"
    }
  ],

  "tiboPosts": [
    {
      "guid": "2078320950488297917",
      "title": "Oops... I did it again. Enjoy reset usage limits...",
      "pubDate": "2026-07-18T03:28:22.000Z",
      "link": "https://x.com/thsottiaux/status/2078320950488297917",
      "context": "",
      "tweetAssessment": {
        "category": "reset_announced",
        "resetSignalStrength": 70,
        "reason": "Explicitly states 'Enjoy reset usage limits' for Codex..."
      }
    }
  ],

  "tiboAnalysis": {
    "resetIntent": "plausible",
    "scoreImpact": 18,
    "cooldownApplies": false,
    "reason": "...",
    "supportingGuids": ["..."]
  },

  "history": [
    {
      "at": "2026-07-18T03:58:44.000Z",
      "fromScore": 3,
      "toScore": 30,
      "scoreDelta": 27,
      "changes": [
        {
          "label": "confirmed reset",
          "delta": 27,
          "details": [...]
        }
      ]
    }
  ],

  "sourceErrors": {},

  "tweetContextClassifier": {
    "mode": "model-cache",
    "model": "gpt-5.4-nano",
    "postCount": 20
  }
}
```

---

## 4. Data Fields Extractable for Our System

| Our Field         | Source Field                                                                      | Notes                                                                           |
| ----------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `probability`     | `forecast.score`                                                                  | 0–100, integer. Clamped 3–95 normally; 100 when reset announced                 |
| `lifecycle`       | `forecast.resetAnnounced` + change in `forecast.latestResetAt`                    | See lifecycle rules in domain-model.md. NOT derived from hoursSinceReset alone. |
| `latestSignal`    | `tiboPosts[*]` filtered by category≠"none", sorted by pubDate DESC                | Latest _relevant_ post. See signal selection algorithm in domain-model.md.      |
| `sourceUpdatedAt` | `fetchedAt`                                                                       | When the source API last fetched its own sub-sources                            |
| `checkedAt`       | Our Worker timestamp                                                              | When our cron handler sent the HTTP request                                     |
| `latestResetAt`   | `forecast.latestResetAt`                                                          | Primary trigger for RESET_COMPLETED and cycle rotation                          |
| `hoursSinceReset` | `forecast.hoursSinceReset`                                                        | Supporting validation only — NOT the primary completion trigger                 |
| `sourceHealth`    | Derived from HTTP status + JSON validity + required field presence + sourceErrors | Three-state: healthy / degraded / unavailable. See domain-model.md.             |

---

## 5. Lifecycle Detection Logic (Corrected)

> ⚠️ **Architecture Correction (Phase 0.5):** The original "phase" field has been renamed to `lifecycle`. RESET_COMPLETED is no longer derived from `hoursSinceReset < 24`. See `docs/domain-model.md` for the canonical definition.

Based on reading `script.js` `getCopy()` and `calculateForecast()`:

```typescript
// CORRECTED lifecycle derivation (authoritative version in domain-model.md)
function deriveLifecycle(
  forecast: ForecastData,
  previousCycleLatestResetAt: string | null
): ResetLifecycle {
  // Announced: source says so explicitly
  if (forecast.resetAnnounced) return 'announced';

  // Completed: a NEW latestResetAt has been observed
  // hoursSinceReset is used for DISPLAY only, not as the primary trigger
  if (forecast.latestResetAt !== null && forecast.latestResetAt !== previousCycleLatestResetAt)
    return 'completed';

  return 'none';
}
```

**Critical nuance:** `score === 100` alone does NOT mean "announced". Use `resetAnnounced` boolean. `hoursSinceReset < 24` is a presentation hint from the source — it may change if source is polled after a delay. Do not use it as the sole detector for RESET_COMPLETED.

**Title/Description copy derived from score:**

| Score                     | Title                            | Phase label          |
| ------------------------- | -------------------------------- | -------------------- |
| `resetAnnounced === true` | "Reset announced."               | `announced`          |
| `hoursSinceReset < 24`    | "It already reset."              | `completed`          |
| `>= 72`                   | "Use it or potentially lose it." | `forecast` (high)    |
| `>= 48`                   | "Worth a tactical token burn."   | `forecast` (medium)  |
| `>= 26`                   | "Do not force it."               | `forecast` (low)     |
| `< 26`                    | "Probably not today."            | `forecast` (minimal) |

---

## 6. Source Refresh Rate

The API itself refreshes **every ~30 minutes** (`nextRefreshAt` is 30 min after `fetchedAt`). Our crawler polling at 10 minutes will not receive new data every poll — but this is fine. We will detect changes when the source actually updates.

**Implication:** Our 10-minute poll cadence is safe. We send ~1 req / 10 min = 6 req/hr. The source updates every 30 min. Zero concern about overloading.

---

## 7. `tweetAssessment.category` Values Observed

```
"reset_announced"    — Tibo explicitly announced an upcoming reset
"reset_completed"    — Tibo confirmed a reset happened
"reset_proposal"     — Vaguepost implying a reset might come
"product_release"    — Product/model release hint
"growth_milestone"   — Event/milestone hint
"none"               — Unrelated tweet
```

These categories drive the `resetAnnounced` boolean and the phase detection.

---

## 8. Robots.txt Check

```
GET /robots.txt → 404 Not Found
```

No robots.txt. No explicit crawl restrictions. The API endpoint is public, unauthenticated, and returns JSON. It is intended to be read.

---

## 9. Risk Analysis

| Risk                                | Likelihood | Severity | Mitigation                                                |
| ----------------------------------- | ---------- | -------- | --------------------------------------------------------- |
| API endpoint changes URL            | Low        | High     | Monitor `script.js`; alert on parse failure               |
| API adds auth/rate limiting         | Low        | High     | Add User-Agent header; exponential backoff on 429         |
| `forecast.score` field renamed      | Medium     | High     | Validate schema at runtime; alert on missing field        |
| `resetAnnounced` logic changes      | Medium     | Medium   | Unit test against fixtures; check source script on deploy |
| Source goes offline                 | Low        | Medium   | Show `sourceAvailable: false`; cache last known good      |
| Score clamping changes (3–95 range) | Low        | Low      | Don't assume range; clamp to 0–100 ourselves              |
| `tiboPosts` becomes empty or null   | Medium     | Low      | Fallback gracefully; no crash                             |

**Most critical risk:** If the source changes `forecast.score` to be computed differently or renames fields. We will detect this via schema validation and alert on parser failure.

---

## 10. Parsing Strategy (Priority Order)

```
Strategy A [PRIMARY]: Fetch /api/forecast JSON from Cloudflare Worker
  - Called from Cloudflare Cron Trigger (not GitHub Actions)
  - Zero HTML parsing
  - Strict runtime schema validation (Zod or equivalent)
  - source.fetchedAt → sourceUpdatedAt
  - forecast.score → probability
  - forecast.resetAnnounced + latestResetAt change → lifecycle
  - tiboPosts filtered by category≠"none", sorted by pubDate → latestSignal
  - No selector dependency
  - If validation fails → sourceHealth="unavailable", no update

Strategy B [FALLBACK - NOT NEEDED]: Parse HTML
  - <span id="score-value"> - rendered by JS, unreliable via server-side fetch
  - Not viable without browser automation
  - DO NOT USE

Strategy C [REJECTED]: Browser automation (Playwright)
  - Overkill — API exists
  - Not viable in Cloudflare Workers
```

**Decision: Use Strategy A exclusively. Cloudflare Cron Trigger owns scheduling.**

---

## 11. Fixture Samples (Sanitized)

### Fixture 1: Normal forecast (score 73)

```json
{
  "fetchedAt": "2026-07-17T15:32:04.000Z",
  "forecast": {
    "score": 73,
    "resetAnnounced": false,
    "daysSinceReset": 31,
    "hoursSinceReset": 750.0,
    "latestResetAt": "2026-06-16T18:49:52.000Z"
  },
  "sourceErrors": {}
}
```

Expected output: `probability: 73, phase: "forecast"`

### Fixture 2: Reset announced (score 100)

```json
{
  "fetchedAt": "2026-07-18T03:30:00.000Z",
  "forecast": {
    "score": 100,
    "resetAnnounced": true,
    "hoursSinceReset": 745.0,
    "hoursSinceResetAnnouncement": 1.5
  },
  "sourceErrors": {}
}
```

Expected output: `probability: 100, phase: "announced"`

### Fixture 3: Reset just completed (score 30, hoursSinceReset < 24)

```json
{
  "fetchedAt": "2026-07-18T05:32:04.000Z",
  "forecast": {
    "score": 30,
    "resetAnnounced": false,
    "daysSinceReset": 0,
    "hoursSinceReset": 1.55,
    "latestResetAt": "2026-07-18T03:58:44.000Z"
  },
  "sourceErrors": {}
}
```

Expected output: `probability: 30, phase: "completed"`

### Fixture 4: Score 90+ (high likelihood)

```json
{
  "fetchedAt": "2026-07-17T15:07:37.000Z",
  "forecast": {
    "score": 95,
    "resetAnnounced": false,
    "daysSinceReset": 31,
    "hoursSinceReset": 744.0
  },
  "sourceErrors": {}
}
```

Expected output: `probability: 95, phase: "forecast"`

### Fixture 5: Source unavailable (network error / API down)

```json
{
  "fetchedAt": null,
  "forecast": null,
  "sourceErrors": { "forecast": "fetch failed" }
}
```

Expected output: `sourceAvailable: false, probability: null`

### Fixture 6: Malformed / missing required fields

```json
{
  "fetchedAt": "2026-07-18T05:32:04.000Z",
  "forecast": {
    "score": null,
    "resetAnnounced": null
  }
}
```

Expected output: Typed parse error, `probability: null`, `sourceAvailable: false` or parser failure flagged

---

## 12. Confirmed Data Availability

| Required Data       | Available | Source                                                 |
| ------------------- | --------- | ------------------------------------------------------ |
| Probability (0–100) | ✅        | `forecast.score`                                       |
| Phase: forecast     | ✅        | Derived from `resetAnnounced + hoursSinceReset`        |
| Phase: announced    | ✅        | `forecast.resetAnnounced === true`                     |
| Phase: completed    | ✅        | `forecast.hoursSinceReset < 24`                        |
| Source updated time | ✅        | `fetchedAt`                                            |
| Latest signal text  | ✅        | `tiboPosts[*].title` filtered by `resetSignalStrength` |
| Signal link         | ✅        | `tiboPosts[*].link`                                    |
| Source errors       | ✅        | `sourceErrors` object                                  |

---

## 13. Ethical & Legal Notes

- ✅ No robots.txt restrictions
- ✅ API is public and unauthenticated
- ✅ We will identify ourselves with a clear User-Agent
- ✅ Request rate is 1 per 10 minutes — far below any reasonable threshold
- ✅ We will always attribute willcodexquotareset.com as the source
- ✅ We will clearly label our tool as "unofficial community tool"
- ✅ We will NOT copy their UI, branding, logo, or copy
- ✅ We will NOT claim our data is more authoritative than theirs

---

## 14. Fallback Strategy

If `/api/forecast` returns:

- **HTTP 4xx/5xx:** Mark `sourceAvailable: false`, keep last known status
- **Invalid JSON:** Mark `sourceAvailable: false`, log parser failure
- **Missing `forecast.score`:** Mark `sourceAvailable: false`, do NOT fabricate probability
- **`sourceErrors` non-empty:** Log warning, use data if `forecast.score` is present, mark which sub-sources failed
- **`forecast.score < 0` or `> 100`:** Clamp to valid range, log warning

---

## 15. Open Questions / Assumptions (Updated Phase 0.5)

1. **Assumption (with risk):** `/api/forecast` is currently accessible without authentication. It was discovered in client-side JS `v=20260617-1`. It is NOT a documented or supported API and may change. See Risk R01, R02 in `docs/risk-register.md`.
2. **Assumption:** `fetchedAt` is a reliable proxy for `sourceUpdatedAt`. This is the timestamp the source uses for its own data freshness. Treat as advisory.
3. **Resolved:** Mirror source score computation? **No** — trust the source score. Our parser transforms and validates; it does not re-compute.
4. **Resolved:** Does extension fetch `/api/forecast` directly? **No** — our Cloudflare Worker fetches the source. The extension only reads our `GET /api/status` endpoint. Extension has no direct dependency on the upstream source.
5. **Corrected:** `hoursSinceReset` is a presentation hint only. RESET_COMPLETED is triggered by a change in `latestResetAt`. See corrected event-model.md.
6. **Corrected:** `sourceAvailable` boolean replaced by three-state `sourceHealth`: healthy / degraded / unavailable. See domain-model.md.
