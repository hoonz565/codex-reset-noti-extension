# Database Schema — Codex Reset Notifier (D1/SQLite)

> **Version:** 0.6 (Product Alignment — Two-Alert MVP)  
> **Engine:** Cloudflare D1 (SQLite dialect)  
> **Migration tool:** Wrangler D1 migrations  
> **Changes from v0.5:**
>
> - Removed `notify_90`, `notify_completed` from subscribers
> - Removed `PROBABILITY_REACHED_90`, `RESET_COMPLETED` from reset_events CHECK
> - Removed `suppressed_by` from reset_events (suppressed candidates not inserted; logged in audit_events only)
> - Added RESET_COMPLETED cycle transition atomicity rule (DEF-2 fix)
> - Removed `PRAGMA journal_mode = WAL` (D1 manages WAL internally)

---

## 1. D1 Capability Constraints

- D1 uses SQLite. `FOREIGN KEY` constraints require `PRAGMA foreign_keys = ON` per connection.
- D1 supports `BEGIN TRANSACTION ... COMMIT` but NOT `SAVEPOINT` in all contexts.
- D1 does NOT support `RETURNING` clause in all versions — compute in application.
- D1 supports `ON CONFLICT` clause (`INSERT OR IGNORE`, `INSERT OR REPLACE`).
- D1 does NOT support `GENERATED ALWAYS AS` columns reliably — compute in application.
- `TEXT` is used for all datetimes (ISO 8601 strings).
- `INTEGER` for booleans (0/1) and counts.
- D1 manages WAL mode internally — do NOT set `PRAGMA journal_mode = WAL` in migrations.

---

## 2. Valid States and Enumerations

### Subscriber States

```
"pending_confirmation"  – created, confirmation email sent, not yet clicked
"active"                – confirmed and receiving alerts
"unsubscribed"          – explicitly unsubscribed
"expired"               – confirmation token expired, never confirmed
"suspended"             – admin-suspended (abuse, bounce)
```

### Delivery States

```
"pending"               – job created, not yet attempted
"processing"            – currently being sent (guard against duplicate send)
"sent_to_provider"      – provider accepted the message (NOT confirmed delivery)
"failed_retryable"      – transient error, will retry
"failed_permanent"      – permanent error (bounce, invalid address), no retry
"cancelled"             – subscriber unsubscribed before send
```

### Reset Cycle States

```
"active"      – current cycle
"superseded"  – older cycle, replaced by a newer one
```

### Subscriber Event Types — reset_events (EXACTLY TWO IN MVP)

```
"PROBABILITY_REACHED_70"
"RESET_ANNOUNCED"
```

### Operational Event Names — audit_events (representative)

```
"reset_completed"            – lifecycle: new latestResetAt detected
"source_degraded"
"source_recovered"
"source_unavailable"
"parser_failure"
"cycle_created"
"bootstrap_complete"
"event_candidates_suppressed"
"cron_started"
"source_fetch_succeeded"
"source_fetch_failed"
"snapshot_created"
"delivery_created"
"delivery_sent_to_provider"
"delivery_failed"
"subscription_created"
"subscription_confirmed"
"preferences_updated"
"subscriber_unsubscribed"
"rate_limit_triggered"
```

---

## 3. Migration 0001 — Initial Schema

```sql
-- Migration: 0001_initial.sql
-- Created: Phase 0.6 (Product Alignment)
-- Note: D1 manages WAL mode internally. Do not set PRAGMA journal_mode.

-- ─── subscribers ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscribers (
  id                         TEXT PRIMARY KEY,          -- ULID or UUID
  email                      TEXT NOT NULL,             -- original casing preserved
  normalized_email           TEXT NOT NULL UNIQUE,      -- lowercase, trimmed
  state                      TEXT NOT NULL DEFAULT 'pending_confirmation',

  -- MVP Preferences: exactly two subscriber alerts
  notify_70                  INTEGER NOT NULL DEFAULT 1,
  notify_announced           INTEGER NOT NULL DEFAULT 1,

  -- Confirmation token
  -- Raw token NEVER stored. Only SHA-256 hash stored.
  confirmation_token_hash    TEXT,
  confirmation_expires_at    TEXT,                      -- ISO 8601

  -- Management token (held by Chrome Extension in chrome.storage.local)
  -- Raw token NEVER stored. Only SHA-256 hash stored.
  management_token_hash      TEXT NOT NULL,
  token_version              INTEGER NOT NULL DEFAULT 1,

  -- Timestamps
  created_at                 TEXT NOT NULL,             -- ISO 8601
  confirmed_at               TEXT,
  updated_at                 TEXT NOT NULL,
  unsubscribed_at            TEXT,

  -- Source attribution
  source                     TEXT,                      -- "chrome_extension", "web"

  -- Rate limiting metadata
  last_confirmation_sent_at  TEXT,

  CHECK (state IN ('pending_confirmation','active','unsubscribed','expired','suspended')),
  CHECK (notify_70 IN (0,1)),
  CHECK (notify_announced IN (0,1))
);

CREATE INDEX IF NOT EXISTS idx_subscribers_normalized_email
  ON subscribers(normalized_email);

CREATE INDEX IF NOT EXISTS idx_subscribers_state
  ON subscribers(state);

CREATE INDEX IF NOT EXISTS idx_subscribers_confirmation_token_hash
  ON subscribers(confirmation_token_hash)
  WHERE confirmation_token_hash IS NOT NULL;

-- ─── reset_cycles ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reset_cycles (
  id                TEXT PRIMARY KEY,    -- "cycle:<latestResetAt>" or "cycle:genesis"
  latest_reset_at   TEXT,               -- ISO 8601 or NULL for genesis cycle
  announcement_at   TEXT,               -- ISO 8601, when RESET_ANNOUNCED first detected
  completed_at      TEXT,               -- ISO 8601, when RESET_COMPLETED operational event recorded
  state             TEXT NOT NULL DEFAULT 'active',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,

  CHECK (state IN ('active', 'superseded'))
);

-- Only one cycle may be active at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_reset_cycles_active
  ON reset_cycles(state)
  WHERE state = 'active';

-- ─── source_snapshots ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS source_snapshots (
  id                TEXT PRIMARY KEY,       -- ULID
  reset_cycle_id    TEXT,
  probability       INTEGER,               -- 0–100 or NULL
  lifecycle         TEXT NOT NULL,
  source_health     TEXT NOT NULL,
  source_updated_at TEXT,                  -- ISO 8601 or NULL
  checked_at        TEXT NOT NULL,
  payload_hash      TEXT NOT NULL,         -- SHA-256 of normalized upstream JSON
  meaningful_change INTEGER NOT NULL DEFAULT 0,  -- 0 or 1

  FOREIGN KEY (reset_cycle_id) REFERENCES reset_cycles(id),
  CHECK (lifecycle IN ('none','announced','completed')),
  CHECK (source_health IN ('healthy','degraded','unavailable')),
  CHECK (meaningful_change IN (0,1))
);

CREATE INDEX IF NOT EXISTS idx_source_snapshots_cycle
  ON source_snapshots(reset_cycle_id);

CREATE INDEX IF NOT EXISTS idx_source_snapshots_checked_at
  ON source_snapshots(checked_at DESC);

-- ─── reset_events ──────────────────────────────────────────────────────────
-- Contains ONLY subscriber events (PROBABILITY_REACHED_70, RESET_ANNOUNCED).
-- RESET_COMPLETED and all operational events go to audit_events.
-- Suppressed event candidates are NOT inserted here; they are recorded in
-- audit_events via the "event_candidates_suppressed" event.

CREATE TABLE IF NOT EXISTS reset_events (
  id                  TEXT PRIMARY KEY,    -- deterministic hash
  reset_cycle_id      TEXT NOT NULL,
  type                TEXT NOT NULL,
  probability         INTEGER,             -- probability at time of event
  source_signal_id    TEXT,               -- tiboPosts guid, if relevant
  source_snapshot_id  TEXT NOT NULL,
  created_at          TEXT NOT NULL,

  FOREIGN KEY (reset_cycle_id) REFERENCES reset_cycles(id),
  FOREIGN KEY (source_snapshot_id) REFERENCES source_snapshots(id),

  -- Core uniqueness: at most one subscriber event of each type per cycle
  -- Enforces threshold-once-per-cycle and announced-once-per-cycle
  UNIQUE(reset_cycle_id, type),

  -- MVP: exactly two subscriber event types allowed
  CHECK (type IN (
    'PROBABILITY_REACHED_70',
    'RESET_ANNOUNCED'
  ))
);

CREATE INDEX IF NOT EXISTS idx_reset_events_cycle
  ON reset_events(reset_cycle_id);

-- ─── notification_deliveries ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id                  TEXT PRIMARY KEY,    -- ULID
  event_id            TEXT NOT NULL,
  subscriber_id       TEXT NOT NULL,
  channel             TEXT NOT NULL DEFAULT 'email',
  state               TEXT NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,               -- ID returned by email provider
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  next_attempt_at     TEXT,               -- ISO 8601
  last_error_code     TEXT,
  last_error_message  TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,

  FOREIGN KEY (event_id) REFERENCES reset_events(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id),

  -- Per-recipient idempotency: at most one delivery per event+subscriber+channel
  UNIQUE(event_id, subscriber_id, channel),

  CHECK (state IN (
    'pending','processing','sent_to_provider',
    'failed_retryable','failed_permanent','cancelled'
  )),
  CHECK (channel IN ('email','whatsapp','telegram','browser'))
);

CREATE INDEX IF NOT EXISTS idx_deliveries_event
  ON notification_deliveries(event_id);

CREATE INDEX IF NOT EXISTS idx_deliveries_subscriber
  ON notification_deliveries(subscriber_id);

CREATE INDEX IF NOT EXISTS idx_deliveries_state_pending
  ON notification_deliveries(state, next_attempt_at)
  WHERE state IN ('pending', 'failed_retryable');

-- ─── rate_limit_records ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_limit_records (
  id              TEXT PRIMARY KEY,
  key             TEXT NOT NULL,        -- normalized_email or installationId-hash
  action          TEXT NOT NULL,        -- "subscribe", "resend_confirmation", etc.
  window_start    TEXT NOT NULL,        -- ISO 8601
  attempt_count   INTEGER NOT NULL DEFAULT 1,
  last_attempt_at TEXT NOT NULL,

  UNIQUE(key, action, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_key_action
  ON rate_limit_records(key, action, window_start);

-- ─── audit_events ──────────────────────────────────────────────────────────
-- Stores ALL operational events including:
-- reset_completed, source_degraded, source_recovered, source_unavailable,
-- parser_failure, cycle_created, bootstrap_complete,
-- event_candidates_suppressed, cron_started, and all observability events.

CREATE TABLE IF NOT EXISTS audit_events (
  id            TEXT PRIMARY KEY,
  correlation_id TEXT,                  -- cron execution ID or request ID
  level         TEXT NOT NULL DEFAULT 'info',
  event         TEXT NOT NULL,          -- structured event name
  deduplication_key TEXT UNIQUE,        -- optional deterministic hash to prevent duplicates (e.g. hash("RESET_COMPLETED"+oldCycleId+newResetAt))
  details       TEXT,                   -- JSON blob; never contains raw tokens or emails
  masked_email  TEXT,                   -- first 3 chars + *** + domain, for tracing
  created_at    TEXT NOT NULL,

  CHECK (level IN ('debug','info','warn','error'))
);

CREATE INDEX IF NOT EXISTS idx_audit_events_event
  ON audit_events(event, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_correlation
  ON audit_events(correlation_id)
  WHERE correlation_id IS NOT NULL;
```

---

## 4. Index Strategy

| Index                                     | Purpose                                |
| ----------------------------------------- | -------------------------------------- |
| `idx_subscribers_normalized_email`        | Lookup by email (upsert, rate limit)   |
| `idx_subscribers_state`                   | Filter active subscribers for dispatch |
| `idx_subscribers_confirmation_token_hash` | Confirm link lookup                    |
| `idx_reset_cycles_active`                 | Enforce single active cycle            |
| `idx_source_snapshots_cycle`              | Latest snapshot for a cycle            |
| `idx_source_snapshots_checked_at`         | Recent history queries                 |
| `idx_reset_events_cycle`                  | Events in a cycle                      |
| `idx_deliveries_event`                    | All deliveries for an event            |
| `idx_deliveries_subscriber`               | All deliveries for a subscriber        |
| `idx_deliveries_state_pending`            | Retry queue                            |
| `idx_rate_limit_key_action`               | Rate limit checks                      |
| `idx_audit_events_event`                  | Log querying                           |
| `idx_audit_events_correlation`            | Request tracing                        |

---

## 5. Transaction Boundaries

| Operation                                         | Transaction scope                              |
| ------------------------------------------------- | ---------------------------------------------- |
| New cycle + initial snapshot                      | Single transaction                             |
| Event creation + delivery job creation            | Single transaction                             |
| **Cycle transition (supersede old + create new)** | **Single atomic transaction — MANDATORY**      |
| Subscription creation                             | Single transaction                             |
| Confirmation                                      | Single transaction: update state + clear token |
| Preference update                                 | Single transaction                             |
| Delivery state transition                         | Single statement (idempotent UPDATE)           |

**Rule:** Never create a reset_event without its source_snapshot in the same transaction.  
**Rule:** Never create delivery jobs outside the event creation transaction.  
**Critical rule (DEF-2):** Cycle transition MUST execute as a single atomic transaction. The exact 7-step sequence is:

1. Current active Cycle A exists.
2. A new latestResetAt is detected.
3. Insert operational RESET_COMPLETED for Cycle A.
4. UPDATE reset_cycles SET state='superseded' WHERE state='active'.
5. INSERT INTO reset_cycles (new active Cycle B).
6. Persist the current source snapshot associated with Cycle B.
7. Commit.
   This ordering prevents the partial-index `idx_reset_cycles_active` from having two active rows at any point. If any step fails, no state changes occur (Cycle A remains active, no events or snapshots are committed).

---

## 6. Concurrency and Idempotency

| Scenario                          | Handling                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| Two overlapping cron executions   | `UNIQUE(reset_cycle_id, type)` on reset_events prevents duplicate subscriber events   |
| Cron retried by platform          | Deterministic event IDs + INSERT OR IGNORE prevent duplicates                         |
| Same subscription request twice   | `UNIQUE(normalized_email)` on subscribers; upsert pattern                             |
| Confirmation link clicked twice   | Idempotent: if already active, succeed silently                                       |
| Preference update submitted twice | Idempotent UPDATE on same subscriber                                                  |
| Delivery created twice            | `UNIQUE(event_id, subscriber_id, channel)` + INSERT OR IGNORE                         |
| Provider timeout after accepting  | Delivery stays in "processing" → cleanup resets to "pending" after 5 min              |
| Worker failure mid-dispatch       | Per-row delivery state machine; incomplete = retryable                                |
| RESET_COMPLETED on Worker retry   | Same latestResetAt → no new cycle; audit_events INSERT OR IGNORE on operational event |

---

## 7. Retention and Cleanup Policy

| Table                               | Retention                                  | Cleanup trigger                     |
| ----------------------------------- | ------------------------------------------ | ----------------------------------- |
| `subscribers`                       | Indefinite (soft delete via state)         | Manual or scheduled                 |
| `reset_cycles`                      | Indefinite                                 | Never deleted                       |
| `source_snapshots`                  | 200 most recent `meaningful_change=1` rows | Maintenance cron (weekly)           |
| `source_snapshots` (non-meaningful) | 7 days                                     | Maintenance cron                    |
| `reset_events`                      | Indefinite                                 | Never deleted                       |
| `notification_deliveries`           | 90 days post-send                          | Maintenance cron                    |
| `rate_limit_records`                | 24 hours                                   | Cleanup on read or maintenance cron |
| `audit_events`                      | 30 days                                    | Maintenance cron                    |

---

## 8. Migration Strategy

```
migrations/
  0001_initial.sql    ← baseline schema (v0.6)
  0002_*.sql          ← future: added columns, indexes
```

Rules:

- Each migration is append-only
- Each migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)
- Migration dry-run in CI: `wrangler d1 migrations apply --dry-run`
- Rollback requires a new forward migration (never modify past migrations)
- Never drop columns in a live migration

---

## 9. Foreign Key Behavior

D1/SQLite requires `PRAGMA foreign_keys = ON` per connection:

```typescript
await env.DB.prepare('PRAGMA foreign_keys = ON').run();
```

ON DELETE behavior defaults to NO ACTION. Application layer handles cascades explicitly.

---

## 10. Phase 7: Orchestration Schema

```sql
-- ─── orchestration_runs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orchestration_runs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'completed_with_errors', 'skipped_overlap', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  source_outcome TEXT CHECK (source_outcome IN ('fresh_snapshot_persisted', 'unchanged_snapshot_persisted', 'unavailable_snapshot_persisted', 'source_request_failed', 'source_validation_failed') OR source_outcome IS NULL),
  snapshot_id TEXT REFERENCES source_snapshots(id) ON DELETE SET NULL,
  events_created INTEGER NOT NULL DEFAULT 0 CHECK (events_created >= 0),
  deliveries_prepared INTEGER NOT NULL DEFAULT 0 CHECK (deliveries_prepared >= 0),
  deliveries_sent INTEGER NOT NULL DEFAULT 0 CHECK (deliveries_sent >= 0),
  deliveries_retried INTEGER NOT NULL DEFAULT 0 CHECK (deliveries_retried >= 0),
  deliveries_failed INTEGER NOT NULL DEFAULT 0 CHECK (deliveries_failed >= 0),
  deliveries_cancelled INTEGER NOT NULL DEFAULT 0 CHECK (deliveries_cancelled >= 0),
  stale_deliveries_recovered INTEGER NOT NULL DEFAULT 0 CHECK (stale_deliveries_recovered >= 0),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_orch_runs_status ON orchestration_runs(status);

-- ─── orchestration_locks ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orchestration_locks (
  name TEXT PRIMARY KEY,
  owner_run_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```
