# Testing Strategy — Codex Reset Notifier

> **Version:** 0.6 (Product Alignment — Two-Alert MVP)
> **Supersedes:** v0.5 Architecture Correction

---

## 1. Test Infrastructure

| Layer                  | Tool                            | Scope                                              |
| ---------------------- | ------------------------------- | -------------------------------------------------- |
| Unit tests             | Vitest                          | Domain logic, parsers, validators, token functions |
| Integration tests      | Vitest + `wrangler dev --local` | D1 repositories, Worker routes, cron handler       |
| Contract tests         | Manual fixtures                 | Source API response parsing                        |
| Extension manual tests | Chrome DevTools                 | Popup, badge, subscription flow                    |
| End-to-end             | Manual checklist                | Full flow: cron → D1 → email → extension           |

---

## 2. Full Test Matrix (50 Tests)

### Domain Tests

| #                | Test                                  | Expected                                                                                           |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| D01              | 69 → 70                               | PROBABILITY_REACHED_70 emitted                                                                     |
| D02              | 69 → 95                               | PROBABILITY_REACHED_70 only (no 90 alert in MVP)                                                   |
| D03              | 69 → announced                        | RESET_ANNOUNCED only                                                                               |
| D04              | 73 → announced                        | RESET_ANNOUNCED emitted                                                                            |
| D05              | 72 → 65 → 71 in same cycle            | No second 70 event                                                                                 |
| D06              | new reset cycle → 69 → 71             | New 70 event is allowed                                                                            |
| D07              | announced → latestResetAt changed     | Operational RESET_COMPLETED; no subscriber event                                                   |
| D08              | first bootstrap at 95                 | No subscriber event                                                                                |
| D09              | first bootstrap while announced       | No subscriber event                                                                                |
| D10              | unavailable source                    | No subscriber event                                                                                |
| D11              | degraded but valid source crossing 70 | 70 event allowed                                                                                   |
| EVENT-PAYLOAD-70 | 69 → 95                               | one PROBABILITY_REACHED_70 event, threshold=70, currentProbability=95, rendered email includes 95% |
| ANNOUNCED-1      | score=100, resetAnnounced=false       | lifecycle is not announced, no RESET_ANNOUNCED subscriber event                                    |
| ANNOUNCED-2      | score=100, resetAnnounced=true        | lifecycle=announced, RESET_ANNOUNCED may be emitted according to cycle rules                       |

### Database Tests

| #             | Test                                                           | Expected                                                                                                                                                             |
| ------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB01          | UNIQUE(reset_cycle_id, PROBABILITY_REACHED_70)                 | Duplicate blocked; INSERT OR IGNORE safe                                                                                                                             |
| DB02          | UNIQUE(reset_cycle_id, RESET_ANNOUNCED)                        | Duplicate blocked                                                                                                                                                    |
| DB03          | new cycle allows a new 70 event                                | Insert succeeds for new reset_cycle_id                                                                                                                               |
| DB04          | subscriber schema contains notify_70 and notify_announced only | Verified via schema reflection or insert                                                                                                                             |
| DB05          | invalid event type PROBABILITY_REACHED_90 rejected             | DB constraint violation                                                                                                                                              |
| DB06          | Unsubscribe clicked twice                                      | Second click: already unsubscribed; success silently                                                                                                                 |
| DB07          | Expired confirmation token submitted                           | Rejected; expiry check enforced                                                                                                                                      |
| DB08          | Invalid management token                                       | Rejected with 401                                                                                                                                                    |
| DB09          | Token version incremented; old unsubscribe link                | Old link rejected (tokenVersion mismatch)                                                                                                                            |
| DB10          | PRAGMA foreign_keys ON: insert snapshot with invalid cycle ID  | Rejected by FK constraint                                                                                                                                            |
| DB11          | Valid unexpired confirmation token submitted                   | state transitions to active, confirmed_at set, confirmation_token_hash cleared, confirmation_expires_at cleared, preferences unchanged, idempotent, no duplicate row |
| CYCLE-TX-1    | Successful completion transition commits all steps             | All 7 steps succeed                                                                                                                                                  |
| CYCLE-TX-2    | Failure after operational event creation                       | Rolls back everything                                                                                                                                                |
| CYCLE-TX-3    | Failure after Cycle A update                                   | Rolls back everything                                                                                                                                                |
| CYCLE-TX-4    | Retrying the same latestResetAt                                | Does not create a duplicate cycle or duplicate RESET_COMPLETED event                                                                                                 |
| AUDIT-IDEMP-1 | Same reset completion retried twice                            | Creates one audit event                                                                                                                                              |
| AUDIT-IDEMP-2 | Same cycle creation retried twice                              | Creates one audit event                                                                                                                                              |
| AUDIT-IDEMP-3 | Same suppression decision retried twice                        | Creates one audit record                                                                                                                                             |

### Delivery Tests

| #    | Test                                                                     | Expected                                                 |
| ---- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| DL01 | 70 event creates deliveries only for notify_70 subscribers               | notify_70=false ignored                                  |
| DL02 | announced event creates deliveries only for notify_announced subscribers | notify_announced=false ignored                           |
| DL03 | RESET_COMPLETED creates no subscriber delivery                           | Operational event only                                   |
| DL04 | same event and subscriber is idempotent                                  | UNIQUE(event_id, subscriber_id, channel) enforced        |
| DL05 | Provider accepts email                                                   | state=sent_to_provider, providerMessageId set            |
| DL06 | Provider returns 429                                                     | state=failed_retryable, next_attempt_at scheduled        |
| DL07 | Provider request times out                                               | state=processing (guard); cleanup job resets to pending  |
| DL08 | Partial batch: 3 of 5 recipients succeed                                 | Failed rows individually retried; success rows untouched |

### API Tests

| #                 | Test                                                             | Expected                                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01               | POST subscription accepts probability70 + resetAnnounced         | 201 with managementToken                                                                                                                                                                                          |
| A02               | POST subscription rejects probability90                          | 400 Bad Request                                                                                                                                                                                                   |
| STATUS-COLD-START | GET /api/status before any successful crawl                      | status is null, sourceHealth is unavailable                                                                                                                                                                       |
| A03               | POST subscription rejects resetCompleted                         | 400 Bad Request                                                                                                                                                                                                   |
| A04               | PATCH preferences requires management token                      | 401 Unauthorized                                                                                                                                                                                                  |
| A05               | Both alerts false                                                | Validation error (400)                                                                                                                                                                                            |
| A06               | Valid confirmation transitions pending_confirmation → active     | state="active" in GET /api/subscriptions/:id/status                                                                                                                                                               |
| A07               | GET /api/status: valid snapshot exists                           | Returns CodexResetStatus schema                                                                                                                                                                                   |
| A08               | CORS preflight from allowed extension origin                     | 200 with correct CORS headers                                                                                                                                                                                     |
| A09               | Rate limited subscription create                                 | 429 with retryAfterSeconds                                                                                                                                                                                        |
| A10               | POST /api/subscriptions/:id/resend-confirmation: cooldown active | 429 with retryAfterSeconds                                                                                                                                                                                        |
| A17               | POST /admin/force-crawl with valid secret                        | invokes same CrawlService as Cron; response includes executionId, snapshotId, sourceHealth, eventsEmitted; 401 if invalid auth; bootstrap-alert override disabled by default; repeated request is safe/idempotent |
| A12               | PATCH preferences: set notify_announced=true                     | confirmed in response                                                                                                                                                                                             |

### Extension Tests

| #   | Test                                                 | Expected                                        |
| --- | ---------------------------------------------------- | ----------------------------------------------- |
| E01 | Expanded form contains exactly two checkboxes        | Only 70% and announced visible                  |
| E02 | Both checkboxes selected by default                  | Default UI state correct                        |
| E03 | No 90% option is rendered                            | 90% alert completely absent                     |
| E04 | No Reset completed option is rendered                | Completed alert completely absent               |
| E05 | Both unchecked disables submit                       | Validation prevents empty preferences           |
| E06 | Checkbox interaction does not collapse panel         | Stays open during selection                     |
| E07 | pending_confirmation state: "Check your inbox" shown | Correct UI state                                |
| E08 | Backend reports active after email confirmation      | Extension polls status; updates to active state |
| E09 | Double submit: second click while submitting         | Button disabled; no duplicate request           |
| E10 | Source unavailable: popup uses cached status         | Stale indicator shown, no crash                 |

### Security Tests

| #          | Test                                                  | Expected                                      |
| ---------- | ----------------------------------------------------- | --------------------------------------------- |
| SEC01      | D1 does not contain raw confirmation tokens           | Only SHA-256 hash stored                      |
| SEC02      | D1 does not contain raw management tokens             | Only SHA-256 hash stored                      |
| SEC03      | GET /api/status response: no subscriber data          | No email, no token in response                |
| SEC04      | SQL injection payload in email field                  | Treated as literal value; parameterized query |
| SEC05      | Unsubscribe link with tampered payload                | HMAC verification fails; error rendered       |
| SEC06      | Old token version in unsubscribe link                 | Rejected (tokenVersion mismatch)              |
| SEC07      | Management endpoint called with no token              | 401                                           |
| SEC08      | Management endpoint called with expired/rotated token | 401                                           |
| ---d token | 401                                                   |

---

## 3. Fixture Requirements for Source Parser

Required fixtures (as files in `tests/fixtures/`):

| Fixture                             | Scenario                       | Key inputs                                                             |
| ----------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `forecast-normal-73.json`           | Normal forecast, score 73      | score=73, resetAnnounced=false, hoursSinceReset=750                    |
| `forecast-prob-70.json`             | Threshold crossing             | score=70, resetAnnounced=false                                         |
| `forecast-announced.json`           | Reset announced                | score=100, resetAnnounced=true                                         |
| `forecast-completed.json`           | Recent reset                   | score=30, resetAnnounced=false, hoursSinceReset=1.5, new latestResetAt |
| `forecast-degraded.json`            | Sub-source failure             | score=73, sourceErrors={"tibo":"failed"}                               |
| `forecast-unavailable-network.json` | Simulated network error        | —                                                                      |
| `forecast-malformed.json`           | Missing required fields        | forecast.score=null                                                    |
| `forecast-no-posts.json`            | Empty tiboPosts                | tiboPosts=[]                                                           |
| `forecast-all-none-category.json`   | All posts category=none        | latestSignal should be null                                            |
| `forecast-invalid-date.json`        | Malformed pubDate on best post | latestSignal graceful null                                             |

---

## 4. CI Test Commands

```bash
# Unit tests
npm run test:unit

# Integration tests (requires wrangler dev or local D1)
npm run test:integration

# All tests
npm run test

# Lint
npm run lint

# Type check
npm run typecheck

# Build
npm run build

# Migration dry-run
wrangler d1 migrations apply codex-reset-db --dry-run --env preview
```

---

## 5. Manual Extension Test Checklist

Run before each Chrome Web Store submission:

```
[ ] Load unpacked extension in chrome://extensions
[ ] Extension loads without console errors
[ ] Badge shows probability (numeric) or … (loading) or ! (unavailable)
[ ] Badge color matches severity tier
[ ] Click extension icon: popup opens
[ ] Popup shows probability, title, description, source time
[ ] "View source" link opens willcodexquotareset.com in new tab
[ ] Manual refresh button triggers fetch and updates badge
[ ] Browser restart: badge still shows last known value
[ ] Focus email input: preferences panel expands
[ ] Click checkboxes: panel stays open
[ ] Clear email, click outside: panel collapses
[ ] Submit with invalid email: blocked with accessible error
[ ] Submit with no alert selected: blocked
[ ] Submit valid email with preferences: Subscribing... state shown
[ ] After submission: "Check your inbox" state shown
[ ] Simulate backend unavailable: cached status displayed, stale indicator shown
[ ] prefers-reduced-motion: animations disabled
[ ] Keyboard only: form is fully usable
[ ] Tab order: logical sequence
[ ] Screen reader: aria-expanded, aria-live regions present
```

Phase 4 preserves the approved Phase 2 transition_token mechanism while extending cycle transition to associate the evidence snapshot.
