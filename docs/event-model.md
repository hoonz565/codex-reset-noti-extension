# Event Model — Codex Reset Notifier

> **Version:** 0.6 (Product Alignment — Two-Alert MVP)  
> **Supersedes:** v0.5 Architecture Correction  
> **Product Decision:** MVP exposes exactly two subscriber alerts — probability70 and resetAnnounced.

---

## 1. Event Type Split

Events are split into two distinct categories with separate storage destinations.

### Subscriber Events → stored in `reset_events`

```typescript
/**
 * Events that generate subscriber notifications.
 * Exactly two types in the MVP.
 */
type SubscriberEventType =
  | 'PROBABILITY_REACHED_70' // probability crossed 70 for the first time in this cycle
  | 'RESET_ANNOUNCED'; // lifecycle changed to "announced" for the first time in this cycle
```

### Operational Events → stored in `audit_events`

```typescript
/**
 * Lifecycle and system events. Never sent to subscribers.
 * RESET_COMPLETED is an operational event — it governs cycle boundaries,
 * not subscriber notifications.
 */
type OperationalEventType =
  | 'RESET_COMPLETED' // new latestResetAt observed; closes cycle, opens next
  | 'SOURCE_DEGRADED' // sourceHealth changed to degraded
  | 'SOURCE_RECOVERED' // sourceHealth recovered
  | 'SOURCE_UNAVAILABLE' // sourceHealth changed to unavailable
  | 'PARSER_FAILURE' // schema validation failed completely
  | 'CYCLE_CREATED' // new reset cycle started
  | 'BOOTSTRAP_COMPLETE' // first successful crawl after cold start
  | 'EVENT_CANDIDATES_SUPPRESSED'; // higher-priority event won; lower candidates not inserted
```

**Rule:** Operational events are NEVER inserted into `reset_events`.  
**Rule:** Only `SubscriberEventType` values are inserted into `reset_events`.  
**Rule:** `RESET_COMPLETED` is an operational lifecycle transition — it does NOT create subscriber delivery rows.

---

## 2. Why RESET_COMPLETED Is Not a Subscriber Event

`RESET_COMPLETED` is essential to the system, but only internally:

| Purpose                                                       | Handled?                 |
| ------------------------------------------------------------- | ------------------------ |
| Close Cycle A, create Cycle B                                 | ✅ Operational           |
| Reset 70% threshold eligibility for Cycle B                   | ✅ Operational           |
| Update public status (lifecycle, latestResetAt, resetCycleId) | ✅ Via status normalizer |
| Record history (meaningful_change = true)                     | ✅ Via source_snapshots  |
| Observability / admin visibility                              | ✅ Via audit_events      |
| Subscriber notification email                                 | ❌ **Not in MVP**        |
| Subscriber preference                                         | ❌ **Not in MVP**        |

**Product rationale:** The source website does not notify users when a reset completes. Our MVP follows the same model. Subscribers who care about completion can observe the public status page.

---

## 3. Reset Cycle Lifecycle Sequence

```
┌─── Cycle A active ─────────────────────────────────────────────┐
│                                                                  │
│  probability < 70                                                │
│       │                                                          │
│       ↓ probability crosses 70 for first time                   │
│  PROBABILITY_REACHED_70 (subscriber event)                      │
│  → insert into reset_events(cycle_A, PROBABILITY_REACHED_70)   │
│  → create delivery rows for notify_70 subscribers              │
│       │                                                          │
│       ↓ resetAnnounced becomes true                             │
│  RESET_ANNOUNCED (subscriber event)                             │
│  → insert into reset_events(cycle_A, RESET_ANNOUNCED)          │
│  → create delivery rows for notify_announced subscribers        │
│       │                                                          │
│       ↓ latestResetAt changes                                   │
│  RESET_COMPLETED (operational event)                            │
│  → record in audit_events only                                  │
│  → supersede Cycle A                                            │
│  → create Cycle B with new latestResetAt                        │
│  → NO subscriber delivery rows created                          │
│                                                                  │
└─── Cycle A superseded ─────────────────────────────────────────┘

┌─── Cycle B active ─────────────────────────────────────────────┐
│  probability < 70 (reset just occurred, score typically drops)  │
│  PROBABILITY_REACHED_70 eligible again if threshold crossed     │
│  RESET_ANNOUNCED eligible again                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Subscriber Event Detection Rules

### PROBABILITY_REACHED_70

```
Conditions:
  previousSnapshot.probability < 70  (or null → bootstrap; skip)
  AND currentSnapshot.probability >= 70
  AND currentSnapshot.sourceHealth !== "unavailable"
  AND NOT reset_events.exists(reset_cycle_id=currentCycle.id, type="PROBABILITY_REACHED_70")

Payload:
  {
    "type": "PROBABILITY_REACHED_70",
    "threshold": 70,
    "currentProbability": <currentSnapshot.probability>
  }

NOT emitted when:
  - probability was already ≥ 70 in this cycle (already emitted)
  - probability re-crosses 70 after dipping below in same cycle
  - source is unavailable
  - bootstrap (first crawl, no previous snapshot)
```

### RESET_ANNOUNCED

```
Conditions:
  previousSnapshot.lifecycle !== "announced"
  AND currentSnapshot.lifecycle === "announced"
  AND currentSnapshot.sourceHealth !== "unavailable"
  AND NOT reset_events.exists(reset_cycle_id=currentCycle.id, type="RESET_ANNOUNCED")

NOT emitted when:
  - already emitted RESET_ANNOUNCED in this cycle
  - source is unavailable
```

---

## 5. Operational Event: RESET_COMPLETED

```
PRIMARY CONDITION:
  current.latestResetAt IS NOT NULL
  AND current.latestResetAt != persistedCycle.latestResetAt

ATOMIC CYCLE TRANSITION SEQUENCE (All steps must succeed or all rollback):
  1. Current active Cycle A exists.
  2. A new latestResetAt is detected.
  3. Insert deterministic operational RESET_COMPLETED for Cycle A.
     (Ownership is explicitly assigned to Cycle A, not Cycle B).
  4. Mark Cycle A completed or superseded (UPDATE state='superseded').
  5. Create new active Cycle B anchored to the new latestResetAt.
  6. Persist the current source snapshot associated with Cycle B.
  7. Commit.

NO subscriber delivery rows are created.

ROLLBACK CRITERIA:
  If any step fails in the D1 transaction:
  - Cycle A remains active.
  - Cycle B does not exist.
  - No RESET_COMPLETED operational event is committed.
  - No partial snapshot is committed.

NOT triggered when:
  - latestResetAt is null → null (both unknown)
  - latestResetAt is malformed → emit PARSER_FAILURE operational event
  - source is unavailable
  - same latestResetAt as current cycle (Worker retry protection)
```

---

## 6. Subscriber Event Precedence

**Within a single poll cycle, emit at most ONE subscriber event.**

Priority (highest wins):

```
RESET_ANNOUNCED
  > PROBABILITY_REACHED_70
```

**Examples with the two-alert model:**

| Previous state               | Current state                       | Subscriber event emitted                    |
| ---------------------------- | ----------------------------------- | ------------------------------------------- |
| probability=69               | probability=73                      | PROBABILITY_REACHED_70                      |
| probability=69               | probability=95                      | PROBABILITY_REACHED_70 only                 |
| probability=72               | lifecycle=announced                 | RESET_ANNOUNCED only                        |
| probability=69               | lifecycle=announced (prob=100)      | RESET_ANNOUNCED only                        |
| lifecycle=announced          | new latestResetAt (RESET_COMPLETED) | **none** — operational only                 |
| probability=30 (new cycle B) | probability=73                      | PROBABILITY_REACHED_70 (new cycle eligible) |

**Key rule:** 69 → 95 emits only PROBABILITY_REACHED_70, not a 90% event.  
**Key rule:** RESET_COMPLETED is processed before subscriber event evaluation (it closes the cycle) but never generates a subscriber notification.

---

## 7. Event Coalescing and Suppression

When RESET_ANNOUNCED wins over a simultaneously eligible PROBABILITY_REACHED_70:

1. **Only RESET_ANNOUNCED is inserted into `reset_events`.**  
   PROBABILITY_REACHED_70 is NOT inserted — it must not consume the uniqueness slot prematurely (the next cycle should be eligible for a fresh 70% event).

2. **An `EVENT_CANDIDATES_SUPPRESSED` operational event is recorded in `audit_events`:**

```json
{
  "event": "EVENT_CANDIDATES_SUPPRESSED",
  "details": {
    "winner": "RESET_ANNOUNCED",
    "suppressedCandidates": ["PROBABILITY_REACHED_70"],
    "resetCycleId": "cycle:...",
    "snapshotId": "..."
  }
}
```

**Rule:** The `suppressed_by` field on `reset_events` rows is removed in this version. Suppressed candidates are not inserted into `reset_events` at all — they are only referenced in the `audit_events.details` JSON of the `EVENT_CANDIDATES_SUPPRESSED` record.

---

## 8. Threshold-Once-Per-Cycle Policy

**Product decision:** Each subscriber alert is sent at most once per reset cycle.

| Alert                  | Max per cycle |
| ---------------------- | ------------- |
| PROBABILITY_REACHED_70 | 1             |
| RESET_ANNOUNCED        | 1             |

Enforced by `UNIQUE(reset_cycle_id, type)` in `reset_events`.

At application layer:

```sql
INSERT INTO reset_events (...) VALUES (...)
ON CONFLICT(reset_cycle_id, type) DO NOTHING
```

If the INSERT resolves to NOTHING (conflict), no delivery jobs are created.

---

## 9. Deterministic Event IDs

```typescript
function computeEventId(
  eventType: SubscriberEventType,
  resetCycleId: string,
  sourceSnapshotId: string
): string {
  // probability no longer included: events are per-cycle type, not per-probability value
  const payload = [eventType, resetCycleId, sourceSnapshotId].join(':');
  return sha256(payload).slice(0, 32);
}
```

---

## 10. Bootstrap Behavior

The first successful scheduled crawl after deployment:

1. Validate source response
2. Persist initial snapshot
3. Resolve or create current reset cycle based on `latestResetAt`
4. Publish initial status
5. **Emit NO subscriber events** (even if probability is 95% or lifecycle is "announced")
6. **Emit BOOTSTRAP_COMPLETE operational event** in audit_events

**Rationale:** Service deployed mid-reset must not surprise users.

**Admin override:** `POST /admin/force-bootstrap-event` — authenticated, disabled by default, auditable.

---

## 11. Meaningful History Policy

A new `source_snapshots` record is created on every poll. The public API exposes only meaningful changes.

**Triggers for `meaningful_change = true`:**

| Trigger                               | Example                        |
| ------------------------------------- | ------------------------------ |
| `lifecycle` changes                   | `none` → `announced`           |
| `latestResetAt` changes               | New reset observed → new cycle |
| `resetCycleId` changes                | Cycle boundary                 |
| `probability` crosses a band boundary | 69% → 70%                      |
| `latestSignal.id` changes             | New top signal post            |
| `sourceHealth` transitions            | `healthy` → `degraded`         |

**Probability bands:**

| Band | Range  |
| ---- | ------ |
| 1    | 0–25   |
| 2    | 26–47  |
| 3    | 48–69  |
| 4    | 70–89  |
| 5    | 90–100 |

> Note: bands 5 (90–99) and 6 (100) from v0.5 are merged into a single band 5 (90–100). There is no product distinction at 90% boundary for history purposes since there is no 90% subscriber alert.

**NOT meaningful:** `checkedAt` changed, `sourceUpdatedAt` changed, probability changed within same band.

**Retention:** 200 most recent meaningful snapshots.

---

## 12. Test Cases Required (Event Model)

### Subscriber Threshold Tests

| #   | Scenario                            | Expected                                  |
| --- | ----------------------------------- | ----------------------------------------- |
| T1  | previous=69, current=70             | PROBABILITY_REACHED_70 emitted            |
| T2  | previous=70, current=71             | No new 70 event (already in cycle)        |
| T3  | previous=72, current=67, current=71 | No 70 event on re-crossing                |
| T4  | previous=69, current=95             | PROBABILITY_REACHED_70 only (no 90 event) |

### Subscriber Lifecycle Tests

| #   | Scenario                                     | Expected                                                          |
| --- | -------------------------------------------- | ----------------------------------------------------------------- |
| L1  | lifecycle: none → announced                  | RESET_ANNOUNCED subscriber event emitted                          |
| L2  | lifecycle: announced → announced             | No event                                                          |
| L3  | new latestResetAt observed                   | RESET_COMPLETED operational event; new cycle; NO subscriber event |
| L4  | same latestResetAt, hoursSinceReset changed  | No RESET_COMPLETED                                                |
| L5  | Worker retry with same new latestResetAt     | No duplicate RESET_COMPLETED                                      |
| L6  | latestResetAt discovered after source outage | Exactly one RESET_COMPLETED operational; no subscriber email      |
| L7  | malformed latestResetAt                      | No event, PARSER_FAILURE in audit_events                          |

### Precedence Tests

| #   | Scenario                           | Expected                                                           |
| --- | ---------------------------------- | ------------------------------------------------------------------ |
| P1  | 69→95 and announced simultaneously | Only RESET_ANNOUNCED emitted; EVENT_CANDIDATES_SUPPRESSED in audit |
| P2  | 69→73 (no announcement)            | Only PROBABILITY_REACHED_70                                        |
| P3  | announced → new latestResetAt      | Only operational RESET_COMPLETED; no subscriber event              |

### Bootstrap Tests

| #   | Scenario                                        | Expected                          |
| --- | ----------------------------------------------- | --------------------------------- |
| B1  | First poll, probability=95                      | No subscriber event               |
| B2  | First poll, lifecycle=announced                 | No subscriber event               |
| B3  | Admin override invoked                          | Subscriber event emitted, audited |
| B4  | New subscriber confirmed after 70% already sent | No historical 70% alert           |

### Source Health Tests

| #   | Scenario                                      | Expected                                         |
| --- | --------------------------------------------- | ------------------------------------------------ |
| S1  | sourceHealth=unavailable, probability was 69  | No PROB_70, status preserved                     |
| S2  | sourceHealth=degraded, probability crosses 70 | PROB_70 emitted (degraded != unavailable)        |
| S3  | Source recovers after unavailable polls       | Status updated, SOURCE_RECOVERED in audit_events |

### New Cycle Tests

| #   | Scenario                                                                  | Expected                               |
| --- | ------------------------------------------------------------------------- | -------------------------------------- |
| N1  | Cycle A: 70% sent; RESET_COMPLETED; Cycle B starts; prob crosses 70 again | New PROB_70 emitted in Cycle B         |
| N2  | Cycle A: ANNOUNCED sent; RESET_COMPLETED; Cycle B starts; announced again | New RESET_ANNOUNCED emitted in Cycle B |

Phase 4 preserves the approved Phase 2 transition_token mechanism while extending cycle transition to associate the evidence snapshot.
