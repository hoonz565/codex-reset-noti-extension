# Incident Response Runbook

## Overview

Standard procedures for responding to incidents in the Codex Reset Notifier production environment.

## Triage

1. Acknowledge the alert.
2. Check the `monitoring.md` runbook for the specific alert.
3. Check Cloudflare Dashboard for Worker error rates and memory limits.

## Common Scenarios

### 1. Database Downtime

If Cloudflare D1 experiences a regional outage, the Worker will return 500s.

- **Action**: Check Cloudflare Status page. Communicate status to users if possible.

### 2. High Email Provider Error Rate

If Resend API begins rejecting emails (e.g., due to rate limits or suppression).

- **Action**: Check Resend dashboard. If necessary, pause orchestration by removing the `EMAIL_PROVIDER_API_KEY` (setting it to an invalid dummy value via `wrangler secret put`). The Worker will log failures instead of burning limits.

### 3. Upstream Source Format Change

If the source payload format changes and breaks parsing.

- **Action**: Check `source.latestHealth` metrics. Roll out a fast hotfix to `source-normalizer.ts` or pause cron triggers in `wrangler.toml` until fixed.
