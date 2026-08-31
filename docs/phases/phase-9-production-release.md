# Phase 9: Production Hardening and Release

## 1. Objective

Deploy the production Worker, configure production D1, configure the email provider, run end-to-end staging tests, and prepare for Chrome Web Store release. Execute these steps safely using explicit approval gates to prevent accidental production mutations.

## 2. Scope

- Production environment configuration (`wrangler.toml` envs).
- Secrets management and runbooks.
- CORS configuration for the production extension ID.
- Email provider staging-safety and sandbox configuration.
- Staging and production D1 deployment strategy.
- Deterministic staging end-to-end verification.
- Monitoring and operational runbooks.
- Chrome Web Store packaging validation.

## 3. Non-goals

- Feature additions.
- Implementation of Phase 10 functionality.
- Direct Cloudflare Queue architecture implementation.
- Provider webhooks implementation.

## 4. Immutable domain rules

- The subscriber-facing event model remains exactly: `PROBABILITY_REACHED_70`, `RESET_ANNOUNCED`.
- No probability-90 event, preference, or notification.
- No `RESET_COMPLETED` subscriber event, preference, delivery, or email. `RESET_COMPLETED` is for operational lifecycle only.
- `RESET_ANNOUNCED` has precedence over `PROBABILITY_REACHED_70`.
- Probability 100 does not imply `RESET_ANNOUNCED`.
- Lifecycle state remains independent from probability.
- `resetCycleId` remains anchored to `latestResetAt`.
- Unavailable or untrusted evidence must never trigger subscriber events.
- The extension must never fetch an upstream source directly.
- CORS is not authentication.
- Status and metrics read models remain read-only.
- All Phase 1–8 behavior and tests must remain regression-free.

## 5. Environment topology

The system uses explicitly separated environments:

- **Local Development**: Default environment. Uses local Miniflare D1.
- **Staging**: Distinct Worker identity (`codex-reset-notifier-staging`). Distinct D1 Database. Accepts explicitly documented development origins.
- **Production**: Distinct Worker identity (`codex-reset-notifier`). Distinct D1 Database. Accepts only the production Chrome Extension ID.

## 6. Configuration strategy

- Use explicit environments in `wrangler.toml` (`[env.staging]`, `[env.production]`).
- Do not commit real database IDs or secret values.
- D1 bindings must uniquely target their respective environment databases.
- `ALLOWED_ORIGINS` is scoped tightly per environment. No wildcards (`*`) or `localhost` allowed in production.

## 7. Secret inventory

- **ADMIN_API_TOKEN**: Protects `/api/admin/metrics`.
- **EMAIL_PROVIDER_API_KEY**: Authenticates with the email provider.
- **RATE_LIMIT_SECRET**: HMAC key for privacy-preserving public API rate-limit identifiers.
- Deployed secrets are bound via Cloudflare `wrangler secret put`; local values stay in the ignored
  `.dev.vars` file, while only `.dev.vars.example` placeholders are committed.
- See `docs/runbooks/secrets-management.md` for management details.

## 8. D1 deployment strategy

- Staging and Production schemas are built strictly by replaying immutable historical migrations.
- Do not alter historical migrations.
- Migrations are applied explicitly with `wrangler d1 migrations apply DB --env <env>`.
- See `docs/runbooks/d1-deployment.md`.

## 9. Worker deployment strategy

- Require explicit environment selection (`--env production`).
- Deploy staging before production.
- Production deployment is blocked until Gate C is explicitly approved.
- See `docs/runbooks/production-deployment.md`.

## 10. CORS strategy

- Production Worker strictly enforces the production Chrome extension ID (`chrome-extension://<PRODUCTION_EXTENSION_ID>`).
- If production ID is unknown, block deployment until available.
- Forbidden Origins are rejected before database queries.
- Public status CORS remains separate from admin authorization.
- Admin metrics always require bearer authentication regardless of CORS.

## 11. Email-provider strategy

- No second provider abstraction. Use the existing structure.
- Staging sends must be neutralized via forced test recipients, a sandbox API mode, or explicit disable flags to prevent emailing real users.
- Production emails are only sent upon explicit approval.
- See `docs/runbooks/email-provider.md`.

## 12. Staging E2E strategy

- Add a deterministic test suite against the deployed staging environment (prefix `REL-E2E-*`).
- Must verify: Health, GET `/api/status`, CORS, OPTIONS, Admin Metrics auth, Orchestration flow, Idempotency, and Staging email safety.
- Exclude unpredictable external upstream state; use controlled staging fixtures.

## 13. Chrome Web Store packaging

- The extension ZIP must point to the production Worker base URL.
- Exclude `localhost`, staging URLs, upstream URLs, secrets, source maps, and test files.
- Manifest must request minimal required permissions.
- Provide a deterministic ZIP script that produces a checksum.
- See `docs/runbooks/chrome-web-store-release.md`.

## 14. Monitoring and alerts

- Document metrics for: Worker request failures, Orchestration failures, Delivery pending backlog, Stale processing leases, Provider errors, D1 failures, Deployment version, etc.
- See `docs/runbooks/monitoring.md`.

## 15. Operational runbooks

Runbooks to be created in `docs/runbooks/`:

- `secrets-management.md`
- `d1-deployment.md`
- `email-provider.md`
- `production-deployment.md`
- `rollback.md`
- `incident-response.md`
- `monitoring.md`
- `chrome-web-store-release.md`

## 16. Rollback procedures

- Document limitations on D1 rollback (schema drops are risky; prefer forward fixes).
- Worker deployment rollback requires deploying the previous Git SHA.
- Chrome Web Store rollback follows Google's versioning procedures.
- See `docs/runbooks/rollback.md`.

## 17. Canonical acceptance requirements

- Implement canonical validation tests for configurations: `REL-CONFIG-`, `REL-SECRET-`, `REL-D1-`, `REL-CORS-`, `REL-EMAIL-`, `REL-E2E-`, `REL-EXT-`, `REL-MON-`, `REL-RUNBOOK-`, `REL-SEC-`, `REL-BOUNDARY-`, `REL-PACKAGE-`.
- Tests must prove: no secrets are committed, staging is safe, CORS is tight, SQL is parameterized, etc.

## 18. External approval gates

- **GATE A — LOCAL RELEASE READINESS**: COMPLETE via the canonical clean-lockfile verification,
  dependency audit, deterministic package/checksum validation, and report generation.
  Fresh verification run `run-1786971793930` confirms 727 tests (85 files), 0 failures.
- **GATE B — STAGING DEPLOYMENT**: COMPLETE. Staging Worker successfully deployed to
  `https://codex-reset-notifier-staging.nguyenminhhung05062005.workers.dev`, staging D1 database
  verified, secrets bound, and fresh HTTPS E2E tests verified (Status E2E: 4 passed / 0 failed;
  Metrics E2E: 8 passed / 0 failed).
- **GATE C — PRODUCTION DEPLOYMENT**: COMPLETE. Production D1 (`e0b99231-cd4e-4e78-bfa3-99a1b6cbdd61`) created and all 7 migrations applied. Worker `codex-reset-notifier` deployed to `https://codex-reset-notifier.nguyenminhhung05062005.workers.dev` (Version `8fd72bc7-9d9e-462a-b7d8-91870fed036a`). ADMIN_API_TOKEN and RATE_LIMIT_SECRET bound. Live E2E verified: GET /api/status → 200/schemaVersion:1, forbidden origin → 403, admin metrics without token → 401.
- **GATE D — CHROME WEB STORE SUBMISSION**: Pending — requires `notidex.click` domain verification in Resend, EMAIL_PROVIDER_API_KEY binding, then explicit phrase `APPROVED TO SUBMIT PHASE 9 TO CHROME WEB STORE`.

## 19. Completion evidence

- All canonical tests pass with zero skips/todos; the generated report records the latest completed
  clean verification run and is refreshed by `scripts/run-verification.cjs`.
- Validated staging and production `wrangler.toml`.
- Runbooks created.
- `phase-9-report.md` indicating readiness state and gate status.

## 20. Remaining risks

- Production D1 ID, Worker hostname, verified sender domain, and Chrome Extension ID are not yet defined.
- Production secrets must be bound out-of-band before deployment.
- Chrome Web Store review delays may stall full release.

## Current status

GATES A, B & C COMPLETE — GATE D PENDING (Resend domain `notidex.click` verification + EMAIL_PROVIDER_API_KEY binding required before Chrome Web Store submission)
