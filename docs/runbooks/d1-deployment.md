# D1 Deployment Runbook

## Overview

This runbook details how to securely deploy and manage D1 database schemas for the Staging and Production environments.

## Architecture

- **Staging D1**: Bound to `[env.staging]` as `codex_reset_staging` (`6a5407b3-0ed5-4f16-bfc5-9322a37e7e12`).
- **Production D1**: Must be created before Gate C. The current all-`2` ID is an intentional blocking placeholder and is rejected by release preflight.

Development, staging, and production databases are strictly isolated. No data is shared.

## Initial Setup / Creating D1 Databases

If databases are not yet created, use Wrangler:

```bash
npx wrangler d1 create codex_reset_staging
npx wrangler d1 create codex_reset_prod
```

Update `wrangler.toml` with the generated `database_id`s in their respective environment blocks.

## Applying Migrations

Migrations are applied sequentially and deterministically. Never alter historical migrations.

**Staging:**

```bash
npx wrangler d1 migrations apply DB --env staging
```

**Production:**

1. Explicitly request deployment approval.
2. Once approved, apply migrations:

```bash
npx wrangler d1 migrations apply DB --env production
```

## Migration Verification

To check the current state of migrations before applying:

```bash
npx wrangler d1 migrations list DB --env production
```

## Pre-deployment Data Checks & Backups

If the migration performs a destructive update (not recommended), backup the database first.
_(Note: Cloudflare D1 provides automatic backups, but manual exports can be taken using `wrangler d1 export` where supported)._

## Post-deployment Verification

After applying migrations, verify schema integrity:

```bash
npx wrangler d1 execute DB --env production --command "SELECT name FROM sqlite_master WHERE type='table';"
```

## Rollback Limitations

- **Forward fixes are preferred.**
- Rolling back schema drops or type changes is generally impossible without data loss. If a schema issue occurs in production, write a new migration to revert or fix the structure forward.
- If data is lost, consult the Cloudflare dashboard to restore a recent snapshot of the D1 database.
