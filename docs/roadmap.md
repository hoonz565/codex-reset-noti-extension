# Codex Reset Notifier Project Roadmap

This document serves as the single canonical roadmap for the Codex Reset Notifier project. It explains the purpose of each phase, dependencies, scope boundaries, branch naming, and artifacts produced.

## Phase 0 — Product and Requirements Discovery

**Status:** APPROVED (Documented externally / via initial artifacts)
**Suggested Branch:** `phase-0-discovery`

- **Purpose:** Identify the product problem, source website, define the two-alert MVP, define user flows, and define major risks and assumptions.
- **Scope:**
  - Approved alerts: probability reaches 70%, reset is announced.
  - Explicitly excluded: probability reaches 90%, reset-completed subscriber alert.

## Phase 0.5 — Architecture and Contract Design

**Status:** APPROVED
**Suggested Branch:** `phase-0.5-architecture`

- **Purpose:** Define system architecture, source API assumptions, lifecycle semantics, event precedence, cycle ownership, and API/security contracts.
- **Approved Architecture:** Cloudflare Workers, Cloudflare D1, Chrome Extension, shared TypeScript contracts.
- **Important Rules:** `RESET_ANNOUNCED` has precedence over `PROBABILITY_REACHED_70`; `RESET_COMPLETED` is operational only; cycle identity is anchored to `latestResetAt`; unavailable source state is distinct from valid probability state; extension never accesses the upstream source directly.

## Phase 1 — Project Foundation

**Status:** APPROVED
**Suggested Branch:** `phase-1-project-foundation`

- **Purpose:** Initialize npm workspaces, configure TypeScript, linting, formatting, tests, builds; create shared schemas, package exports, and CF Worker types.
- **Outputs:** Reproducible `package-lock.json`, workspace build scripts, shared runtime schemas, two-alert contract, clean CI commands.

## Phase 1A — Worker/Extension Transport Spike

**Status:** APPROVED
**Suggested Branch:** `phase-1a-worker-extension-spike`

- **Purpose:** Validate Chrome Extension MV3, popup-to-Worker communication, CORS, shared schemas in both directions, local Wrangler transport.
- **Outputs:** Stub GET `/api/status`, stub POST `/api/subscriptions`, OPTIONS/CORS handling, development manifest, end-to-end verification. No persistence or crawler logic.

## Phase 2 — D1 Persistence Layer

**Status:** APPROVED
**Suggested Branch:** `phase-2-d1-persistence`

- **Purpose:** Create D1 schema and migrations, database row models/mappers, repository interfaces/implementations, idempotency, transaction boundaries, test migrations.
- **Canonical Tables:** `subscribers`, `reset_cycles`, `source_snapshots`, `reset_events`, `notification_deliveries`, `rate_limit_records`, `audit_events`.
- **Constraints:** Only one active reset cycle; only two subscriber event types; `source_snapshot_id` is required for subscriber events; `updated_at` remains a valid timestamp; transition ownership uses `transition_token`.

## Phase 3 — Source Client and Snapshot Service

**Status:** APPROVED
**Suggested Branch:** `phase-3-source-snapshots`

- **Purpose:** Call public upstream forecast endpoint, runtime-validate response, normalize source data, derive source health, select latest relevant signal, compute payload hashes, classify meaningful changes, persist source snapshots.
- **Expected Modules:** SourceForecastClient, SourceNormalizer, SourceHealthResolver, LatestSignalSelector, MeaningfulChangeClassifier, SnapshotService.
- **Strict Exclusions:** No subscriber event creation, no notification delivery, no cycle transition orchestration, no production Cron scheduling.

## Phase 4 — Cycle and Event Detection

**Status:** APPROVED
**Suggested Branch:** `phase-4-cycle-event-detection`

- **Purpose:** Bootstrap and manage reset cycles, compare fresh snapshots, detect subscriber event candidates, enforce event precedence, record operational lifecycle events, transition reset cycles atomically.
- **Expected Behavior:** Detect `PROBABILITY_REACHED_70` and `RESET_ANNOUNCED` (latter wins on tie); suppressed candidates go to `audit_events`; `RESET_COMPLETED` remains operational; events occur at most once per cycle.

## Phase 5 — Subscription Management

**Status:** APPROVED
**Suggested Branch:** `phase-5-subscription-management`

- **Purpose:** Implement subscription creation, confirmation flow, management tokens, preference updates, unsubscribe flow, subscriber state transitions, abuse protection.
- **Approved Preferences:** `probability70`, `resetAnnounced`.

## Phase 6 — Notification Delivery

**Status:** APPROVED
**Suggested Branch:** `phase-6-email-delivery`

- **Purpose:** Create delivery rows for eligible subscribers, implement email provider adapter, safely claim pending deliveries, retry retryable failures, mark permanent failures, avoid duplicate delivery.

## Phase 7 — Cron and Production Orchestration

**Status:** APPROVED
**Suggested Branch:** `phase-7-orchestration-cron`

- **Purpose:** Configure Worker Cron, execute source checks, persist snapshots, invoke cycle/event processing, create delivery jobs, dispatch notification processing, add protected admin force-run functionality.

## Phase 8 — Final Extension Product UI

**Status:** APPROVED
**Suggested Branch:** `phase-8-dashboard-metrics`

- **Purpose:** Replace transport-spike UI, display current reset status, source health, implement subscription UI, confirmation and management flows.
- **Strict Rules:** Exactly two alert options, no direct access to the source website, production manifest excludes localhost permissions.

## Phase 9 — Production Hardening and Release

**Status:** IN PROGRESS — GATES A, B & C COMPLETE (Gate D pending Resend domain verification)
**Suggested Branch:** `phase-9-production-release`

- **Purpose:** Deploy production Worker, configure production D1, configure production extension ID and CORS, configure email provider, verify migrations, run staging tests, prepare Chrome Web Store release.

Production D1 (`e0b99231-cd4e-4e78-bfa3-99a1b6cbdd61`) created, all 7 migrations applied, Worker deployed to `https://codex-reset-notifier.nguyenminhhung05062005.workers.dev`, ADMIN_API_TOKEN and RATE_LIMIT_SECRET bound, live E2E verified. Awaiting `notidex.click` domain verification in Resend → EMAIL_PROVIDER_API_KEY → Gate D Chrome Web Store submission.
