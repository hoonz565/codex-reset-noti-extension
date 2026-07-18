# Phase 0.5: Architecture and Contract Design

## 1. Objective

Define system architecture, source API assumptions, lifecycle semantics, event precedence, cycle ownership, and API/security contracts.

## 2. In scope

- Defining the Cloudflare Workers + D1 backend architecture.
- Designing the Chrome Extension (Manifest V3) integration.
- Defining the shared TypeScript contracts and database schema models.
- Specifying lifecycle semantics (`announced`, `completed`).

## 3. Out of scope

- Actual implementation of the Workers or Extension.
- Implementation of the D1 database tables.

## 4. Inputs/dependencies

- Phase 0 product requirements.

## 5. Outputs/artifacts

- `docs/architecture.md`
- `docs/domain-model.md`
- `docs/database-schema.md`
- `docs/event-model.md`
- `docs/source-analysis.md`
- `docs/api-contracts.md`

## 6. Important domain rules

- `RESET_ANNOUNCED` has precedence over `PROBABILITY_REACHED_70`.
- `RESET_COMPLETED` is an operational concept only (no subscriber alert).
- Cycle identity is anchored to `latestResetAt`.
- Unavailable source state is distinct from valid probability state and must not trigger subscriber events.
- The extension never accesses the upstream source directly.

## 7. Required tests

- N/A (Documentation phase)

## 8. Acceptance criteria

- All core architecture and domain models are documented.
- Security boundaries (CORS, token hashing) are defined.

## 9. Current status

APPROVED

## 10. Suggested Git branch

`phase-0.5-architecture`

## 11. Completion evidence or links to reports

- Documentation files in `docs/` have been finalized and reviewed.

## 12. Risks and unresolved questions

- D1 concurrency limits (mitigated via idempotency keys and `transition_token`).
