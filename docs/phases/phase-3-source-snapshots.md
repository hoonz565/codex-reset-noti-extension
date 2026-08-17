# Phase 3: Source Client and Snapshot Service

## 1. Objective

Call the public upstream forecast endpoint, runtime-validate its response, normalize source data, derive source health, select the latest relevant signal, classify meaningful changes, and persist source snapshots.

## 2. In scope

- `SourceForecastClient` with timeout and HTTP error handling.
- `SourceNormalizer` to validate raw JSON and normalize probability/lifecycle.
- `SourceHealthResolver` to derive `healthy`/`degraded`/`unavailable`.
- `LatestSignalSelector` to pick the newest relevant post.
- `MeaningfulChangeClassifier` to determine if a snapshot represents a notable change.
- `SnapshotService` to fetch and store `source_snapshots`.

## 3. Out of scope

- Creating subscriber events (`PROBABILITY_REACHED_70`, `RESET_ANNOUNCED`).
- Notification delivery or email sending.
- Reset-cycle transition orchestration.
- Cron scheduling or production cron handlers.

## 4. Inputs/dependencies

- Phase 2 persistence layer (`SourceSnapshotRepository`).
- Phase 0.5 architectural contracts for source health and meaning.

## 5. Outputs/artifacts

- Source client and normalization modules in `packages/worker/src/source/`.
- `SnapshotService` in `packages/worker/src/services/`.
- Snapshot row persisted to D1.

## 6. Important domain rules

- Raw upstream payload must be fully validated.
- Unknown fields must not break parsing.
- Probability is never inferred or coerced incorrectly.
- Unavailable snapshots may preserve the last known numeric probability, but are treated as stale.
- The snapshot service uses the currently known active cycle, and does not create or rotate cycles.

## 7. Required tests

- Client HTTP scenarios (Timeout, 429, 4xx, 5xx, invalid JSON, schema mismatch).
- Normalizer bounds and type checking.
- Source health logic.
- Snapshot service database interactions and meaningful-change logic.

## 8. Acceptance criteria

- Source client correctly handles all error states.
- Probability extraction remains independent of lifecycle extraction.
- Snapshot history correctly reflects upstream state.
- No subscriber event is created.

## 9. Current status

APPROVED

## 10. Suggested Git branch

`phase-3-source-snapshots`

## 11. Unknown Field Handling

Unknown upstream fields are tolerated by the raw schema but are not trusted automatically.
Specifically, unknown fields:

- Are **not** exposed in `CodexResetStatus`.
- Are **not** persisted as part of the raw snapshot payload (the system only hashes canonical fields and persists atomic typed values, not the raw JSON).
- Are **not** included in the semantic hash by default.
- Are **not** logged on normal success to prevent log noise.
- Are **not** interpreted as new lifecycle or event data.

## 12. Hash Volatility Policy

The `PayloadHasher` ensures deterministic and semantic hashing by sorting keys.

- **Excluded**: `checkedAt` and `sourceUpdatedAt` are strictly excluded from the canonical JSON stringified representation. This ensures that timestamps alone do not trigger hash changes.
- **Included**: Semantic data such as `probability`, `lifecycle`, `latestResetAt`, `sourceHealth`, `sourceWarnings`, `title`, and `latestSignalId` remain included.

## 13. Stale Data Policy

When a source is unavailable but a valid snapshot exists previously:

- `sourceHealth` remains `unavailable`.
- `SOURCE_DATA_STALE` is appended to warnings.
- `checkedAt` is the current failed attempt time.
- `sourceUpdatedAt` remains the previous valid source time.
- The persisted probability is display/history data only.
- No event or delivery row is created.
- **Phase 4 constraint**: Stale data is explicitly forbidden from being used as fresh evidence for event detection or cycle transitions.

## 14. Completion evidence or links to reports

- Implementation: commit `efa95ce` (`feat: implement Phase 3 source snapshot pipeline`).
- Regression evidence: [Phase 9 verification report](../../phase-9-report.md).

## 15. Risks and unresolved questions

- Upstream schema changes (mitigated by tolerant parsing).
