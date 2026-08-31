# Monitoring and Alerts Runbook

## Overview

This document describes the critical operational metrics for the Codex Reset Notifier Worker and the response playbook for alerts.

## Critical Metrics

### 1. Worker Request Failures

- **Signal**: HTTP 5xx errors on `GET /api/status` or `GET /api/admin/metrics`.
- **Query/Dashboard**: Cloudflare Dashboard > Workers > codex-reset-notifier > Metrics (Errors).
- **Warning Threshold**: >1% error rate in 5 minutes.
- **Critical Threshold**: >5% error rate in 5 minutes.
- **Owner Action**: Check Worker logs (via `wrangler tail --env production`). Check D1 connectivity.
- **Mitigation**: Rollback Worker deployment if recently updated.

### 2. Orchestration Failures

- **Signal**: `orchestration.failed` metric count.
- **Query/Dashboard**: `GET /api/admin/metrics?window=1h`
- **Warning Threshold**: >1 failure per hour.
- **Critical Threshold**: >3 consecutive failures.
- **Owner Action**: Check provider health and source API health.

### 3. Stale Source Evidence

- **Signal**: `source.latestHealth` is `stale` or `unavailable`.
- **Query/Dashboard**: `GET /api/admin/metrics`
- **Warning Threshold**: Stale for >30 minutes.
- **Owner Action**: Validate the upstream data source is operating correctly.

### 4. Delivery Pending Backlog

- **Signal**: `deliveries.duePending` count.
- **Query/Dashboard**: `GET /api/admin/metrics`
- **Warning Threshold**: >1000 due pending deliveries lasting longer than 15 minutes.
- **Owner Action**: Check email provider rate limits. Increase orchestration concurrency if necessary.

### 5. Stale Processing Leases

- **Signal**: `deliveries.staleProcessing` count.
- **Query/Dashboard**: `GET /api/admin/metrics`
- **Warning Threshold**: >10 stale leases.
- **Owner Action**: Worker execution timeouts might be interrupting the delivery process. Investigate memory/CPU usage limits.

### 6. Provider Errors

- **Signal**: `deliveries.failedPermanent` count.
- **Query/Dashboard**: `GET /api/admin/metrics`
- **Warning Threshold**: Spike in permanent failures.
- **Owner Action**: Verify `EMAIL_PROVIDER_API_KEY` validity. Check provider dashboard for suppression lists or suspension.
