# Architecture — Codex Reset Notifier

> **Version:** 0.5 (Architecture Correction)  
> **Status:** Phase 0.5 — Approved before Phase 1 begins  
> **Supersedes:** GitHub Actions + Google Apps Script + Google Sheets design  
> **Classification:** Unofficial community tool. Data sourced from willcodexquotareset.com.

---

## 1. Decision Summary

The original design used GitHub Actions as the runtime scheduler, Google Sheets as the database, and Google Apps Script as the subscription and email backend. This is replaced in full.

**Selected architecture:**

| Concern           | Chosen Technology               | Reason                                                 |
| ----------------- | ------------------------------- | ------------------------------------------------------ |
| Runtime compute   | Cloudflare Workers              | Edge compute, generous free tier, TypeScript           |
| Scheduled polling | Cloudflare Cron Triggers        | Native scheduler, no Git-commit side effects           |
| Persistent state  | Cloudflare D1 (SQLite)          | Relational, free tier, native Worker binding           |
| Subscription API  | Cloudflare Worker HTTP handlers | Same runtime as crawler                                |
| Public status API | Cloudflare Worker HTTP handlers | Consistent backend, proper CORS                        |
| Email delivery    | EmailProvider boundary          | Resend in production; mock/disabled adapters elsewhere |
| CI/CD             | GitHub Actions                  | Lint, test, build, deploy, migration                   |
| Chrome Extension  | Manifest V3                     | Per original spec                                      |

**Eliminated from primary architecture:**

- ~~GitHub Actions as production scheduler~~
- ~~GitHub Pages as primary status API~~
- ~~Git commits as state persistence~~
- ~~Google Sheets as subscriber database~~
- ~~Google Apps Script as subscription backend~~
- ~~Google Apps Script as confirmation backend~~
- ~~Google Apps Script as event dispatcher~~
- ~~Apps Script LockService for concurrency~~
- ~~MailApp as primary email channel~~

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  willcodexquotareset.com                                            │
│  GET /api/forecast  (unofficial, undocumented, may change)          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ 1 request per Cron Trigger cycle
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Cloudflare Worker  (TypeScript, Hono or native fetch handler)      │
│                                                                     │
│  ┌─────────────┐   ┌──────────────────┐   ┌────────────────────┐  │
│  │ Cron Handler│──▶│  SourceClient     │   │  HTTP Router       │  │
│  └─────────────┘   │  - fetch          │   │  GET  /api/status  │  │
│                    │  - validate       │   │  POST /api/subscriptions│
│  ┌─────────────┐   │  - retry/backoff  │   │  GET  /confirm     │  │
│  │ Admin Handler│  └────────┬─────────┘   │  GET  /unsubscribe │  │
│  └─────────────┘           │              │  PATCH /api/subscriptions│
│                            ▼              │        /:id/preferences│  │
│                   ┌────────────────┐      │  POST /api/subscriptions│
│                   │ StatusNormalizer│      │        /:id/resend  │  │
│                   │ - health model │      └────────────────────┘  │
│                   │ - signal select│                               │
│                   │ - snapshot     │                               │
│                   └────────┬───────┘                              │
│                            │                                       │
│                   ┌────────▼───────┐                              │
│                   │ CycleResolver  │                              │
│                   │ - find/create  │                              │
│                   │   reset cycle  │                              │
│                   └────────┬───────┘                              │
│                            │                                       │
│                   ┌────────▼───────┐                              │
│                   │ EventDetector  │                              │
│                   │ - precedence   │                              │
│                   │ - once/cycle   │                              │
│                   │ - deterministic│                              │
│                   │   IDs          │                              │
│                   └────────┬───────┘                              │
│                            │                                       │
│                   ┌────────▼───────┐                              │
│                   │DeliveryJobFactory                             │
│                   │ - per-recipient │                              │
│                   │ - idempotent    │                              │
│                   └────────┬───────┘                              │
│                            │                                       │
│                   ┌────────▼───────────────────────────┐          │
│                   │  NotificationDispatcher             │          │
│                   │  channel: EmailNotificationChannel  │          │
│                   │  (future: WhatsApp, Telegram, Push) │          │
│                   └────────┬───────────────────────────┘          │
└────────────────────────────┼────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────────┐
          ▼                  ▼                       ▼
┌──────────────────┐  ┌───────────────┐   ┌─────────────────────┐
│  Cloudflare D1   │  │ Email Provider│   │  Chrome Extension   │
│                  │  │  (Resend,     │   │  MV3                │
│  subscribers     │  │   Mailgun, or │   │                     │
│  reset_cycles    │  │   optional    │   │  background.ts      │
│  source_snapshots│  │   Apps Script │   │  → GET /api/status  │
│  reset_events    │  │   adapter)    │   │  → badge update     │
│  notification_   │  └───────────────┘   │                     │
│    deliveries    │                       │  popup.ts           │
│  rate_limit_     │                       │  → status display   │
│    records       │                       │  → subscription form│
│  audit_events    │                       │  → POST /api/subs   │
└──────────────────┘                       └─────────────────────┘
```

---

### Current HTTP surface

The route labels in the conceptual diagram above are superseded by the implemented API surface:

- `GET /api/status`
- `POST /api/subscriptions` and `POST /api/subscriptions/confirm`
- `POST /api/subscriptions/request-management-link`
- `GET/PATCH /api/subscriptions/manage` and `POST /api/subscriptions/unsubscribe`
- `GET /confirm` and `GET /manage` for the no-store hosted browser flow
- `GET /api/admin/metrics` and `POST /api/admin/orchestration/run`

## 3. GitHub Actions — CI/CD Only

GitHub Actions is **strictly limited to CI/CD**. It does not run the production crawler, write state files, or dispatch events.

### `ci.yml` (on PR and push to main)

- Lint
- Unit tests
- Integration tests (D1 local via wrangler)
- Build
- Migration validation (`wrangler d1 migrations apply --dry-run`)

### `deploy.yml` (on push to main, protected)

- `wrangler deploy`
- `wrangler d1 migrations apply --env production`
- No secrets printed to logs
- Deployment concurrency lock (`concurrency: deploy-production`)

**Eliminated problems from old design:**

- No status.json committed to Git every 10 minutes
- No push loops from Git auto-commits
- No merge conflicts from parallel status updates
- No Git history bloat from state files
- No workflow overlap writing to the same file

---

## 4. Cloudflare Free Tier Constraints

| Resource            | Free Limit            | Our Expected Usage                     |
| ------------------- | --------------------- | -------------------------------------- |
| Worker requests/day | 100,000               | 96 scheduled runs/day plus API traffic |
| Worker CPU time     | 10ms/request (shared) | < 5ms per cron cycle                   |
| D1 reads/day        | 5,000,000             | << limit                               |
| D1 writes/day       | 100,000               | << limit                               |
| D1 storage          | 5 GB                  | Negligible for MVP                     |
| Cron triggers       | 5 per account         | 1 used                                 |
| Workers             | 100 per account       | 2 planned (staging + production)       |

Sources: [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
and [D1 pricing/limits](https://developers.cloudflare.com/d1/platform/pricing/), checked
2026-08-17. Free-tier limits can change and must be rechecked before production deployment.

---

## 5. Rejected Temporary Apps Script Email Adapter

> **Status: not implemented and not approved for the MVP.** Production uses the Resend adapter; staging
> uses the network-free disabled adapter.

A Google Apps Script MailApp adapter may be documented as a zero-credential fallback for users who cannot obtain an email provider API key. It must:

- Implement `EmailNotificationChannel` interface
- Own no database tables
- Own no subscription logic
- Own no event state
- Be replaceable without touching domain logic
- Be clearly marked as "temporary" in all documentation

The adapter receives a structured `NotificationDelivery` object and calls `MailApp.sendEmail()`. Nothing else.

---

## 6. Historical Worker Structure Target

The tree below is retained as the original design sketch. The implemented structure is authoritative
under `packages/worker/src/`, with native fetch routing in `index.ts`, hosted pages in
`http/public-pages.ts`, repositories in `db/repositories/`, and provider adapters in
`email/providers/`.

```
src/
├── index.ts                  ← entry point, routes
├── cron/
│   └── crawl.ts              ← scheduled handler
├── api/
│   ├── status.ts             ← GET /api/status
│   ├── subscriptions.ts      ← POST, GET, PATCH, DELETE
│   └── admin.ts              ← protected admin endpoints
├── web/
│   ├── confirm.ts            ← GET /confirm (HTML page)
│   └── unsubscribe.ts        ← GET /unsubscribe (HTML page)
├── domain/
│   ├── source-client.ts
│   ├── status-normalizer.ts
│   ├── cycle-resolver.ts
│   ├── event-detector.ts
│   ├── delivery-job-factory.ts
│   └── notification-dispatcher.ts
├── channels/
│   ├── types.ts              ← NotificationChannel interface
│   ├── email/
│   │   ├── index.ts          ← EmailNotificationChannel
│   │   ├── resend.ts         ← ResendEmailProvider
│   │   └── appsscript.ts     ← optional AppsScriptEmailProvider
│   └── (future: whatsapp, telegram, push)
├── db/
│   ├── migrations/
│   │   └── 0001_initial.sql
│   ├── repositories/
│   │   ├── subscribers.ts
│   │   ├── cycles.ts
│   │   ├── snapshots.ts
│   │   ├── events.ts
│   │   ├── deliveries.ts
│   │   └── audit.ts
│   └── schema.ts
├── shared/
│   ├── types.ts
│   ├── errors.ts
│   ├── tokens.ts
│   └── validation.ts
└── config.ts
```

---

## 7. Environment Separation

| Environment  | D1 Database         | Worker             | Purpose     |
| ------------ | ------------------- | ------------------ | ----------- |
| `local`      | D1 local (wrangler) | `wrangler dev`     | Development |
| `preview`    | D1 preview          | Preview deployment | Staging     |
| `production` | D1 production       | Production Worker  | Live        |

Secrets per environment stored in Cloudflare dashboard (not `.env` committed to repo).

```
# Required Cloudflare secrets (wrangler secret put):
ADMIN_API_TOKEN           ← internal admin auth
EMAIL_PROVIDER_API_KEY    ← Resend API key
RATE_LIMIT_SECRET         ← HMAC key for privacy-safe rate-limit identifiers

# Non-secret production variables:
EMAIL_FROM_ADDRESS        ← verified sender identity
MANAGEMENT_PAGE_URL       ← public Worker /manage URL
```

---

## 8. Source Polling Decision

The upstream API reportedly refreshes approximately every 30 minutes (`nextRefreshAt` observed to be 30 minutes ahead of `fetchedAt`).

**Decision: Poll every 15 minutes.**

Rationale:

- 10 minutes was proposed in original spec
- Source only updates every ~30 minutes, so polling every 10 minutes doubles wasted requests
- 15 minutes still catches updates within one refresh cycle
- nextRefreshAt-based dynamic skip was considered but adds complexity and the upstream field is not guaranteed stable
- 15 minutes = 96 requests/day, well within free tier and respectful of the source

**Cron expression:** `*/15 * * * *`

**Jitter:** Cloudflare does not support per-cron jitter natively. The Worker may add a randomized sleep of 0–60s before fetching if desired, but this is optional for MVP.

## Phase 8: Dashboard and Metrics

Added StatusDashboard component to the extension and /api/status, /api/admin/metrics to the worker.
