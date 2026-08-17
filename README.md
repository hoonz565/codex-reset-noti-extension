# Codex Reset Notifier

Cloudflare Workers + D1 based architecture to monitor and notify when the Codex Quota resets.

## Documentation

- [Project Roadmap](docs/roadmap.md)
- [Git Workflow](docs/git-workflow.md)
- [Architecture](docs/architecture.md)
- [Domain Model](docs/domain-model.md)
- [Database Schema](docs/database-schema.md)

### Phase Documents

- [Phase 0: Product Requirements](docs/phases/phase-0-product-requirements.md)
- [Phase 0.5: Architecture & Contracts](docs/phases/phase-0.5-architecture-contracts.md)
- [Phase 1: Project Foundation](docs/phases/phase-1-project-foundation.md)
- [Phase 1A: Transport Spike](docs/phases/phase-1a-transport-spike.md)
- [Phase 2: D1 Persistence](docs/phases/phase-2-d1-persistence.md)
- [Phase 3: Source Snapshots](docs/phases/phase-3-source-snapshots.md)
- [Phase 4: Cycle & Event Detection](docs/phases/phase-4-cycle-event-detection.md)
- [Phase 5: Subscription Management](docs/phases/phase-5-subscription-management.md)
- [Phase 6: Notification Delivery](docs/phases/phase-6-notification-delivery.md)
- [Phase 7: Cron Orchestration](docs/phases/phase-7-cron-orchestration.md)
- [Phase 8: Dashboard, Metrics & Final UI](docs/phases/phase-8-dashboard-metrics.md)
- [Phase 9: Production Release](docs/phases/phase-9-production-release.md)

## Project Status

| Phase     | Name                     | Status                                                | Branch                            |
| --------- | ------------------------ | ----------------------------------------------------- | --------------------------------- |
| Phase 0   | Product Requirements     | APPROVED                                              | `phase-0-discovery`               |
| Phase 0.5 | Architecture & Contracts | APPROVED                                              | `phase-0.5-architecture`          |
| Phase 1   | Project Foundation       | APPROVED                                              | `phase-1-project-foundation`      |
| Phase 1A  | Transport Spike          | APPROVED                                              | `phase-1a-worker-extension-spike` |
| Phase 2   | D1 Persistence           | APPROVED                                              | `phase-2-d1-persistence`          |
| Phase 3   | Source Snapshots         | APPROVED                                              | `phase-3-source-snapshots`        |
| Phase 4   | Cycle & Event Detection  | APPROVED                                              | `phase-4-cycle-event-detection`   |
| Phase 5   | Subscription Management  | APPROVED                                              | `phase-5-subscription-management` |
| Phase 6   | Notification Delivery    | APPROVED                                              | `phase-6-email-delivery`          |
| Phase 7   | Cron Orchestration       | APPROVED                                              | `phase-7-orchestration-cron`      |
| Phase 8   | Dashboard, Metrics & UI  | APPROVED                                              | `phase-8-dashboard-metrics`       |
| Phase 9   | Production Release       | IN PROGRESS — STAGING VERIFIED (GATES A & B COMPLETE) | `phase-9-production-release`      |

Phase 9 Gates A and B are complete (727 tests pass, staging Worker deployed to Cloudflare, and live HTTPS E2E tests verified). Gates C and D require production configuration plus the explicit approval phrases documented in the [Phase 9 plan](docs/phases/phase-9-production-release.md).
