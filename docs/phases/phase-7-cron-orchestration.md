# Phase 7: Cron and Production Orchestration

## 1. Objective

Configure the Worker Cron trigger to execute source checks, persist snapshots, invoke cycle/event processing, create delivery jobs, and dispatch notification processing.

## 2. In scope

- Cloudflare Worker Scheduled Handler (`scheduled`).
- Coordination between Phase 3 (Snapshot), Phase 4 (Events), and Phase 6 (Delivery).
- Protected admin force-run functionality.
- Observability and recovery behavior.

## 3. Out of scope

- Extension UI.
- Upstream parsing logic (handled in Phase 3).

## 4. Inputs/dependencies

- All backend services (Phase 3-6).

## 5. Outputs/artifacts

- `src/index.ts` cron handler.
- Admin HTTP endpoint for manual invocation.

## 6. Important domain rules

- Execution must be idempotent.
- Overlapping Cron runs must be safe (handled by DB transaction constraints).
- Source failures must not trigger false events.
- Secrets must be configured outside Git.

## 7. Required tests

- Orchestration flow tests.
- Idempotency under concurrent execution.

## 8. Acceptance criteria

- The system can run autonomously on a schedule.
- Recoverable from stale states.

## 9. Current status

APPROVED

## 10. Suggested Git branch

`phase-7-orchestration-cron`

## 11. Completion evidence or links to reports

- Implementation: commit `394fbaf` (`feat: implement Phase 7 cron orchestration`).
- Regression evidence: [Phase 9 verification report](../../phase-9-report.md).

## 12. Risks and unresolved questions

- Worker CPU time limits for large fan-outs (may require Queues).
