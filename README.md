# Codex Reset Notifier

> **Chrome Extension & Serverless Backend** to monitor OpenAI Codex quota reset cycles and send timely email alerts.

[![CI Tests](https://img.shields.io/badge/Tests-727%20Passed-success?style=flat-square)](docs/testing-strategy.md)
[![Cloudflare Workers](https://img.shields.io/badge/Backend-Cloudflare%20Workers-orange?style=flat-square)](https://workers.cloudflare.com)
[![Cloudflare D1](<https://img.shields.io/badge/Database-Cloudflare%20D1%20(SQLite)-blue?style=flat-square>)](https://developers.cloudflare.com/d1/)
[![Chrome Extension](https://img.shields.io/badge/Extension-Manifest%20V3-yellow?style=flat-square)](packages/extension)
[![Email Provider](https://img.shields.io/badge/Email-Resend-black?style=flat-square)](https://resend.com)

---

## 📖 Overview

**Codex Reset Notifier** is an end-to-end monitoring and notification platform designed for developers and AI engineers who rely on OpenAI Codex quota resets. Instead of constantly checking status pages manually, this tool tracks quota reset likelihood automatically and delivers alerts straight to your inbox.

- **Frontend:** Chrome Extension (Manifest V3) with a popup dashboard showing real-time reset probability, cycle status, and notification management.
- **Backend:** Cloudflare Workers running every 15 minutes via Cron triggers, backed by a Cloudflare D1 SQL database.
- **Delivery:** Transactional emails powered by Resend with SPF/DKIM verified domain (`notidex.click`).

---

## ✨ Key Features

### 1. 📊 Live Reset Forecast & Status

- **Real-Time Probability:** View current reset probability percentage (0–100%) and cycle health status.
- **Cycle Tracking:** Displays time elapsed since the last reset and when the next background check occurs.
- **State Badges:** Instant visual indicators (`PROBABILITY_REACHED_70`, `RESET_ANNOUNCED`, etc.).

### 2. 🔔 Dual Smart Alert System

Supports two subscriber-facing notification triggers:

- **`PROBABILITY_REACHED_70`**: Triggered when reset likelihood crosses **≥ 70%** — giving you advance notice to prepare your workload.
- **`RESET_ANNOUNCED`**: Triggered when an official reset announcement is detected — highest precedence.

### 3. 📧 Email Subscription & Management

- **Granular Preferences:** Choose to receive 70% probability alerts, announcement alerts, or both.
- **Secure Confirmation Flow:** Double opt-in confirmation links to prevent unauthorized subscriptions.
- **One-Click Unsubscribe & Self-Service Portal:** Manage alert preferences or unsubscribe permanently anytime at `/manage`.

### 4. 🛡️ Privacy & Security First

- **No Direct Third-Party Access:** The Chrome Extension never talks to upstream forecast APIs directly; all requests flow through the hardened Worker API.
- **Minimal Permissions:** Manifest V3 requests only the dedicated Worker origin.
- **Privacy-Preserving Rate Limiting:** Subscription rate limits are computed using HMAC hashes (`RATE_LIMIT_SECRET`), never raw IP addresses or plain emails.
- **Zero Advertising or Data Sharing:** Email addresses are strictly used for quota reset notifications.

---

## 🏗️ Architecture & Monorepo Structure

```
codex-reset/
├── packages/
│   ├── shared/         # Domain models, Zod validation schemas, API contracts
│   ├── worker/         # Cloudflare Worker API, Cron scheduler, D1 persistence, Resend integration
│   └── extension/      # Chrome Extension MV3 popup UI & API client
├── docs/               # Architecture, domain model, database schema, and operational runbooks
│   ├── runbooks/       # Secrets, D1, deployment, monitoring, and rollback runbooks
│   └── phases/         # Specifications and completion reports for Phases 0–9
├── scripts/            # Release verification, preflight checks, and extension packaging
└── artifacts/          # Generated deterministic verification reports & release checksums
```

---

## 🚀 Live Endpoints & Production Resources

| Resource                | Value                                                                     |
| :---------------------- | :------------------------------------------------------------------------ |
| **Worker API URL**      | `https://codex-reset-notifier.nguyenminhhung05062005.workers.dev`         |
| **Status Endpoint**     | `GET /api/status`                                                         |
| **Privacy Policy**      | `https://codex-reset-notifier.nguyenminhhung05062005.workers.dev/privacy` |
| **Management Portal**   | `https://codex-reset-notifier.nguyenminhhung05062005.workers.dev/manage`  |
| **D1 Database**         | `codex_reset_prod` (`e0b99231-cd4e-4e78-bfa3-99a1b6cbdd61`)               |
| **Sender Domain**       | `alerts@notidex.click` (Resend verified)                                  |
| **Chrome Extension ID** | `oecegicjjbjgdaipabophafmkgaieohl`                                        |

---

## 🛠️ Development & Testing

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

### Setup

```bash
# Clone the repository
git clone https://github.com/hoonz565/codex-reset-noti-extension.git
cd codex-reset-noti-extension

# Install dependencies cleanly
npm ci
```

### Common Commands

```bash
# Run all tests across workspaces (727 tests)
npm test

# Run code format check & linter
npm run format:check
npm run lint

# Run TypeScript typechecks across workspaces
npm run typecheck

# Build all packages (shared, worker, extension)
npm run build

# Package deterministic Chrome Extension ZIP
npm run package:extension

# Run full release verification runner
node scripts/run-verification.cjs
```

---

## 📚 Documentation

- [Project Roadmap](docs/roadmap.md)
- [System Architecture](docs/architecture.md)
- [Domain Model & Lifecycle](docs/domain-model.md)
- [Database Schema & Migrations](docs/database-schema.md)
- [API Contracts](docs/api-contracts.md)
- [Testing Strategy](docs/testing-strategy.md)
- [Operational Runbooks](docs/runbooks/)

---

## 📋 Project Status

| Phase     | Name                     |  Status  | Branch                            |
| :-------- | :----------------------- | :------: | :-------------------------------- |
| Phase 0   | Product Requirements     | APPROVED | `phase-0-discovery`               |
| Phase 0.5 | Architecture & Contracts | APPROVED | `phase-0.5-architecture`          |
| Phase 1   | Project Foundation       | APPROVED | `phase-1-project-foundation`      |
| Phase 1A  | Transport Spike          | APPROVED | `phase-1a-worker-extension-spike` |
| Phase 2   | D1 Persistence           | APPROVED | `phase-2-d1-persistence`          |
| Phase 3   | Source Snapshots         | APPROVED | `phase-3-source-snapshots`        |
| Phase 4   | Cycle & Event Detection  | APPROVED | `phase-4-cycle-event-detection`   |
| Phase 5   | Subscription Management  | APPROVED | `phase-5-subscription-management` |
| Phase 6   | Notification Delivery    | APPROVED | `phase-6-email-delivery`          |
| Phase 7   | Cron Orchestration       | APPROVED | `phase-7-orchestration-cron`      |
| Phase 8   | Dashboard, Metrics & UI  | APPROVED | `phase-8-dashboard-metrics`       |
| Phase 9   | Production Release       | APPROVED | `phase-9-production-release`      |

---

_Disclaimer: This is an independent community tool and is not affiliated with, endorsed by, or sponsored by OpenAI._
