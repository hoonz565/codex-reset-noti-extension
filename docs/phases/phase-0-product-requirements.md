# Phase 0: Product and Requirements Discovery

## 1. Objective

Identify the product problem, the source website to monitor, define the minimum viable product (MVP) alerts, user flows, and identify major risks and assumptions.

## 2. In scope

- Defining the MVP scope of two specific alerts: `PROBABILITY_REACHED_70` and `RESET_ANNOUNCED`.
- Identifying the upstream data source to monitor.
- Outlining the user flows for subscription and notification.

## 3. Out of scope

- `probability90` subscriber preference.
- `notify_90` or `notify_completed` logic.
- `RESET_COMPLETED` subscriber alert.
- Technical architecture definition (moved to Phase 0.5).

## 4. Inputs/dependencies

- Initial project idea and stakeholder requirements.

## 5. Outputs/artifacts

- Product requirement definitions.
- Initial risk register (see `docs/risk-register.md`).

## 6. Important domain rules

- The MVP requires exactly two subscriber alerts: when the reset probability reaches 70%, and when a reset is officially announced.

## 7. Required tests

- N/A (Documentation and discovery phase)

## 8. Acceptance criteria

- MVP scope is strictly defined and agreed upon.
- Explicit exclusions are documented to prevent scope creep.

## 9. Current status

APPROVED

## 10. Suggested Git branch

`phase-0-discovery`

## 11. Completion evidence or links to reports

- `docs/risk-register.md` contains initial risk assessments.
- Requirements have been codified into Phase 0.5 architecture documents.

## 12. Risks and unresolved questions

- Risk of source schema changes or rate limits (tracked in `docs/risk-register.md`).
