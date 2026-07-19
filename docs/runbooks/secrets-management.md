# Secrets Management Runbook

## Overview

This document describes the secrets required by the Codex Reset Notifier Worker and how to securely manage them across environments. Secrets must **never** be committed to Git.

## Secret Inventory

### `ADMIN_API_TOKEN`

- **Purpose**: Authenticates `/api/admin/metrics` requests.
- **Environments**: Staging, Production.
- **Consumer**: Metrics API Routes (`metrics-routes.ts`).
- **Never Log**: This token string must never appear in application logs or API responses.

### `EMAIL_PROVIDER_API_KEY`

- **Purpose**: Authenticates with the external email provider (e.g., Resend).
- **Environments**: Staging, Production.
- **Consumer**: `ConfiguredEmailProvider` / `DeliveryDispatchService`.
- **Never Log**: The key must never be logged.

## How to Set Secrets

Use Wrangler to inject secrets securely into Cloudflare.

**For Staging:**

```bash
npx wrangler secret put ADMIN_API_TOKEN --env staging
npx wrangler secret put EMAIL_PROVIDER_API_KEY --env staging
```

**For Production:**

```bash
npx wrangler secret put ADMIN_API_TOKEN --env production
npx wrangler secret put EMAIL_PROVIDER_API_KEY --env production
```

## How to Verify Secrets

To verify that a secret is bound without exposing its value:

```bash
npx wrangler secret list --env production
```

This lists the keys of secrets that exist for the given environment.

## Rotation Procedure

1. Generate the new secret.
2. Update the secret in Cloudflare using `wrangler secret put <KEY> --env <ENV>`.
3. The new secret will immediately take effect for new Worker instances.
4. Verify the system works (e.g., admin metrics still fetch successfully).

## Revocation/Rollback Procedure

If a secret is compromised:

1. Immediately delete the secret: `wrangler secret delete <KEY> --env <ENV>`.
2. Revoke the key in the external provider's dashboard.
3. Generate a new key and apply the Rotation Procedure.
