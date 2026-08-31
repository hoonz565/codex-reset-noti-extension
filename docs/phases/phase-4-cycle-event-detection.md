# Phase 4: Cycle and Event Detection

## 1. Objective

Bootstrap and manage reset cycles, compare fresh snapshots, detect subscriber event candidates, enforce event precedence, record operational lifecycle events, and transition reset cycles atomically.

## 2. In scope

- Bootstrapping genesis cycle.
- Event detector logic to detect `PROBABILITY_REACHED_70` and `RESET_ANNOUNCED`.
- Enforcing precedence (e.g., `RESET_ANNOUNCED` wins).
- Emitting operational `RESET_COMPLETED` audit events.
- Atomic transition of reset cycles using `performCycleTransition`.

## 3. Out of scope

- Upstream data fetching (handled in Phase 3).
- Notification email dispatch.
- Cron orchestration.

## 4. Inputs/dependencies

- Phase 3 snapshot data.
- Phase 2 cycle transaction primitives.

## 5. Outputs/artifacts

- Event detector and cycle orchestrator services.
- Database records in `reset_events` and `audit_events`.

## 6. Important domain rules

- Events occur at most once per cycle.
- Unavailable/stale probability snapshots cannot trigger events.
- `RESET_ANNOUNCED` suppresses `PROBABILITY_REACHED_70` if detected simultaneously.
- `RESET_COMPLETED` transitions the cycle but does not emit a subscriber event.

## 7. Required tests

- Detection rules for all edge cases and precedence rules.
- Transactional integrity of event insertion.
- Stale data rejection.

## 8. Acceptance criteria

- Correct events are generated based on snapshot diffs.
- Cycles transition correctly when a reset occurs.

## 9. Current status

APPROVED

## 10. Suggested Git branch

`phase-4-cycle-event-detection`

## 11. Completion evidence or links to reports

- Implementation: commit `f83635e` (`feat: implement Phase 4 cycle and event detection`).
- Regression evidence: [Phase 9 verification report](../../phase-9-report.md).

## 12. Risks and unresolved questions

- Missed detections if upstream is degraded during transition window.

Phase 4 preserves the approved Phase 2 transition_token mechanism while extending cycle transition to associate the evidence snapshot.
