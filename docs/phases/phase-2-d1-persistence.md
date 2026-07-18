# Phase 2: D1 Persistence Layer

## 1. Objective

Create the D1 database schema, migrations, database row models/mappers, and repository interfaces to establish idempotency and transaction boundaries.

## 2. In scope

- SQL migrations for 7 canonical tables (`subscribers`, `reset_cycles`, `source_snapshots`, `reset_events`, `notification_deliveries`, `rate_limit_records`, `audit_events`).
- Repositories for all tables.
- Transactional cycle transitions using `db.batch()`.
- Safe `already_transitioned` narrowing and `transition_token` locking.

## 3. Out of scope

- Upstream source fetching.
- Event detection logic (Phase 4).
- Production cron scheduling.

## 4. Inputs/dependencies

- Phase 0.5 database schema design.

## 5. Outputs/artifacts

- `packages/worker/migrations/`
- `packages/worker/src/db/` (schema mappers, repositories, transactions).

## 6. Important domain rules

- At most one active reset cycle (enforced by partial unique index).
- `source_snapshot_id` is required (`NOT NULL`) for reset events.
- `updated_at` must remain a valid ISO timestamp; `transition_token` is the atomic transition lock.
- Rate limit table is consistently named `rate_limit_records`.

## 7. Required tests

- Migration application tests.
- Repository unit tests including conflict and idempotency handling.
- Transaction tests for cycle transitions.

## 8. Acceptance criteria

- All schema constraints enforce domain rules natively.
- Transaction failures cleanly roll back.
- Exact same transition retry returns `already_transitioned`; stale ones return `stale_precondition`.

## 9. Current status

APPROVED

## 10. Suggested Git branch

`phase-2-d1-persistence`

## 11. Completion evidence or links to reports

- `phase2_verification_report.md` artifact confirming 75/75 passing tests and successful migration application.

## 12. Risks and unresolved questions

- None remaining.
