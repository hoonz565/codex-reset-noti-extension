# Domain Model — Codex Reset Notifier

> **Version:** 0.6 (Product Alignment — Two-Alert MVP)  
> **Supersedes:** v0.5 Architecture Correction  
> **Product Decision:** MVP exposes exactly two subscriber alerts — probability70 and resetAnnounced.

---

## 1. Core Design Principles

1. **Probability and lifecycle are independent dimensions.** A recent completed reset does not erase the current probability reading.
2. **Do not fabricate values.** A source error never produces a fake probability.
3. **Source health is granular.** A sub-source failure does not automatically make the entire forecast unavailable.
4. **Reset cycles scope all events.** Threshold and lifecycle events are unique per cycle.
5. **Timestamps have precise semantics.** `checkedAt`, `sourceUpdatedAt`, `publishedAt`, and `statusChangedAt` are never confused.

---

## 2. Primary Status Type

```typescript
// ─── Enumerations ────────────────────────────────────────────────────

/**
 * The reset lifecycle state, independent of probability.
 *
 * "none"       – No active reset announcement or confirmed completion in scope.
 * "announced"  – An official reset announcement is active (forecast.resetAnnounced === true).
 * "completed"  – A new latestResetAt has been observed, distinct from the previous cycle boundary.
 */
type ResetLifecycle = 'none' | 'announced' | 'completed';

/**
 * Reflects confidence in the upstream API data.
 *
 * "healthy"     – Fetch succeeded, all required fields valid, sourceErrors empty.
 * "degraded"    – Required fields valid (probability usable), but one or more optional
 *                 upstream sub-sources (e.g. Twitter mirror) failed.
 * "unavailable" – Network failure, invalid JSON, required fields missing, or schema mismatch
 *                 preventing trusted interpretation of probability.
 */
type SourceHealth = 'healthy' | 'degraded' | 'unavailable';

// ─── Latest Signal ────────────────────────────────────────────────────

/**
 * The most recently published relevant Tibo post that is not category "none".
 * Selected by pubDate descending, after filtering out category "none" and invalid dates.
 * If no relevant post exists, latestSignal is null.
 *
 * Selection algorithm (canonical):
 *   1. Filter tiboPosts where tweetAssessment.category !== "none" (or assessment missing).
 *   2. Validate pubDate is a parseable ISO datetime.
 *   3. Sort by pubDate descending.
 *   4. Take the first element.
 *   5. Return null if empty.
 *
 * This is "latest relevant" not "strongest recent". The distinction matters.
 * Do not sort by resetSignalStrength.
 */
interface LatestSignal {
  id: string; // guid from tiboPosts
  title: string; // cleaned post text
  url: string | null; // x.com link, or null if not a valid X status URL
  publishedAt: string; // ISO 8601 UTC
  category: string; // tweetAssessment.category value
  strength: number | null; // resetSignalStrength 0–100, or null if not present
}

// ─── Public Status ────────────────────────────────────────────────────

interface CodexResetStatus {
  /**
   * Schema version for forward compatibility.
   * Increment when breaking changes are made to the public shape.
   */
  schemaVersion: 1;

  /**
   * Current forecast probability, 0–100 integer, or null.
   *
   * Sources from forecast.score.
   * It must be a number between 0 and 100 if the source is healthy or degraded.
   * If the source is unavailable, probability may be null or a numeric value (preserving the last known probability).
   * Note for Phase 3: An unavailable snapshot with a numeric probability does not represent fresh source evidence and must not trigger subscriber events.
   * Never fabricated from error conditions.
   * Probability and lifecycle are INDEPENDENT — a completed reset
   * does not reset or nullify this field.
   */
  probability: number | null;

  /**
   * Current reset lifecycle state.
   * Independent of probability.
   */
  lifecycle: ResetLifecycle;

  /**
   * Opaque stable identifier for the current reset cycle.
   * Scopes all threshold and lifecycle events.
   *
   * Format: `cycle:<latestResetAt ISO>` when latestResetAt is known.
   * Format: `cycle:genesis` for the initial cycle before any reset is observed.
   *
   * A new cycle is created when latestResetAt changes.
   * This field is INCLUDED in the public API so the extension can
   * detect cycle rotation and clear local threshold-sent state.
   */
  resetCycleId: string;

  /**
   * ISO 8601 UTC of the most recently observed Codex quota reset completion.
   * Sources from forecast.latestResetAt.
   * null if no reset has been observed.
   */
  latestResetAt: string | null;

  /**
   * ISO 8601 UTC when the current reset announcement was detected.
   * null if lifecycle !== "announced".
   */
  announcementAt: string | null;

  /**
   * Human-readable title derived from probability and lifecycle.
   */
  title: string;

  /**
   * Human-readable description derived from probability and lifecycle.
   */
  description: string;

  /**
   * Most recently published relevant signal post.
   * See LatestSignal definition and selection algorithm above.
   * null if no relevant post exists.
   */
  latestSignal: LatestSignal | null;

  /** URL of the upstream source. */
  sourceUrl: string;

  /**
   * ISO 8601 UTC: when the upstream source last fetched its own sub-sources.
   * Sources from fetchedAt in the upstream API response.
   * null if source is unavailable.
   */
  sourceUpdatedAt: string | null;

  /**
   * ISO 8601 UTC: when our Worker polled the upstream source.
   * Always set, even on fetch failure (reflects the attempt time).
   */
  checkedAt: string;

  /**
   * ISO 8601 UTC: when any meaningful field in this status last changed.
   * Not updated on checkedAt-only changes.
   */
  statusChangedAt: string;

  /**
   * ISO 8601 UTC: when this status was written to D1 and made public.
   */
  publishedAt: string;

  /** Health of the upstream source. */
  sourceHealth: SourceHealth;

  /**
   * Human-readable warnings about degraded sub-sources.
   * Empty array when sourceHealth is "healthy".
   * Example: ["Twitter mirror unavailable — Tibo signals not updated"]
   */
  sourceWarnings: string[];

  /**
   * Version string for the parsing logic.
   * Increment when the normalization algorithm changes.
   */
  parserVersion: string;
}
```

---

## 3. Nullable Field Handling

| Field             | Nullable | Condition                        |
| ----------------- | -------- | -------------------------------- |
| `probability`     | Yes      | `sourceHealth === "unavailable"` |
| `latestResetAt`   | Yes      | No reset observed in source data |
| `announcementAt`  | Yes      | `lifecycle !== "announced"`      |
| `latestSignal`    | Yes      | No relevant Tibo post found      |
| `sourceUpdatedAt` | Yes      | Source unavailable on this poll  |
| `sourceWarnings`  | No       | Empty array `[]` when healthy    |

**Rule:** Never use `undefined`. Every nullable field is explicitly typed as `T | null`.

---

## 4. Timestamp Semantics (Precise)

| Timestamp         | Source                                                         | Meaning                                                     |
| ----------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| `sourceUpdatedAt` | `response.fetchedAt`                                           | When the upstream API last ran its own sub-source fetches   |
| `checkedAt`       | Our Worker, `Date.now()` at start of cron cycle                | When we sent the HTTP request to the upstream               |
| `statusChangedAt` | Computed by our system                                         | When any meaningful field in the public status last changed |
| `publishedAt`     | Our Worker, after successful D1 write                          | When the updated status was committed and ready to serve    |
| `latestResetAt`   | `response.forecast.latestResetAt`                              | When the source last recorded a completed quota reset       |
| `announcementAt`  | Derived: first moment `resetAnnounced === true` in our records | When the current announcement was detected by our system    |

**These timestamps must never be interchanged.**

---

## 5. Source Health Rules

```
healthy:
  - HTTP 200
  - response body is valid JSON
  - forecast.score is a number 0–100
  - forecast.resetAnnounced is a boolean
  - forecast.latestResetAt is null or parseable ISO string
  - response.sourceErrors is empty or absent

degraded:
  - All required fields above are valid
  - response.sourceErrors contains one or more keys
    (e.g. "tibo" source failed, but "status" succeeded)
  - Probability is usable
  - sourceWarnings populated from sourceErrors keys
  - NO subscriber events suppressed solely due to degraded state

unavailable:
  - Network failure or timeout
  - HTTP status >= 400
  - Invalid JSON
  - forecast is null or missing
  - forecast.score is null, undefined, NaN, or not a number
  - forecast.resetAnnounced is null or undefined
  - Schema version mismatch preventing trusted interpretation
  - DO NOT emit subscriber threshold or lifecycle events
  - DO NOT update the public status probability
  - DO keep the last valid public status
  - DO record the failure in audit_events
  - DO expose sourceHealth="unavailable" in the public status
```

---

## 6. Title and Description Copy

Derived from `lifecycle` first, then `probability`:

| Condition                   | Title                  | Description                                                     |
| --------------------------- | ---------------------- | --------------------------------------------------------------- |
| `lifecycle === "completed"` | "Quota reset complete" | "Codex quota limits have reset. A new usage cycle has begun."   |
| `lifecycle === "announced"` | "Reset announced"      | "An official reset is in progress. Quota has not yet refilled." |
| `probability >= 90`         | "Very high likelihood" | "The estimated reset likelihood is currently {P}%."             |
| `probability >= 70`         | "High likelihood"      | "The estimated reset likelihood is currently {P}%."             |
| `probability >= 48`         | "Moderate likelihood"  | "The estimated reset likelihood is currently {P}%."             |
| `probability >= 26`         | "Low likelihood"       | "The estimated reset likelihood is currently {P}%."             |
| `probability < 26`          | "Unlikely"             | "The estimated reset likelihood is currently {P}%."             |
| `probability === null`      | "Status unavailable"   | "Unable to retrieve forecast data. Last known status shown."    |

**Note:** `lifecycle === "completed"` takes priority over probability in title/description because the reset has already occurred. The probability field still reflects the current source reading.

---

## 7. ResetCycleId Format

```
Format A (known reset): "cycle:2026-07-18T03:58:44.000Z"
  - Uses latestResetAt ISO string verbatim from the source
  - Computed as: `cycle:${latestResetAt}`

Format B (genesis — no reset observed): "cycle:genesis"
  - Used when latestResetAt is null on first bootstrap
  - Transitions to Format A when the first latestResetAt is observed

Format C (paranoid hash — alternative):
  - SHA-256(latestResetAt)[:16]
  - Avoids URL-encoding issues but less human-readable
  - Decision: Use Format A for MVP (readable, debuggable)
```

**Cycle boundary rules:**

- A new cycle is created exactly when `current.latestResetAt !== persisted.latestResetAt`
- New cycle resets threshold eligibility (70%, 90% events may fire again)
- Old cycle events are never deleted — only new events are blocked from re-firing in the new cycle context
- `latestResetAt` null → null is NOT a boundary (both sides unknown)

---

## 8. Event Type Definitions (Canonical)

```typescript
/**
 * Subscriber events — stored in reset_events.
 * Exactly two types in the MVP.
 * Each type is unique per reset cycle (UNIQUE(reset_cycle_id, type)).
 */
type SubscriberEventType = 'PROBABILITY_REACHED_70' | 'RESET_ANNOUNCED';

/**
 * Operational events — stored in audit_events.
 * Never create subscriber delivery rows.
 * RESET_COMPLETED is an operational lifecycle event: it closes the current
 * reset cycle and creates the next one, but does NOT notify subscribers.
 */
type OperationalEventType =
  | 'RESET_COMPLETED'
  | 'SOURCE_DEGRADED'
  | 'SOURCE_RECOVERED'
  | 'SOURCE_UNAVAILABLE'
  | 'PARSER_FAILURE'
  | 'CYCLE_CREATED'
  | 'BOOTSTRAP_COMPLETE'
  | 'EVENT_CANDIDATES_SUPPRESSED';
```

---

## 9. Internal Types (not in public API)

```typescript
interface SourceSnapshot {
  id: string; // ULID
  resetCycleId: string;
  probability: number | null;
  lifecycle: ResetLifecycle;
  lifecycle_raw: string; // raw resetAnnounced + hoursSinceReset for audit
  sourceHealth: SourceHealth;
  sourceUpdatedAt: string | null;
  checkedAt: string; // always set at cron attempt time (never null in DB row)
  payloadHash: string; // SHA-256 of normalized upstream JSON
  meaningfulChange: boolean; // whether this snapshot triggered a status update
}

interface ResetCycle {
  id: string; // "cycle:<latestResetAt>" or "cycle:genesis"
  latestResetAt: string | null;
  announcementAt: string | null;
  completedAt: string | null; // when RESET_COMPLETED operational event was recorded
  state: 'active' | 'superseded';
  createdAt: string;
  updatedAt: string;
}
```

Phase 4 preserves the approved Phase 2 transition_token mechanism while extending cycle transition to associate the evidence snapshot.

## Phase 8: Status and Metrics

Added Public Reset Status and Admin Metrics concepts.
