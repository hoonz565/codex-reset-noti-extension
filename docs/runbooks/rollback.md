# Rollback Runbook

## Overview

This runbook covers how to safely revert deployments for the Cloudflare Worker, D1 Database, and Chrome Extension.

## Cloudflare Worker Rollback

If a production deployment of the Worker causes a critical incident:

1. Identify the last known good Git commit (`git log`).
2. Checkout the commit: `git checkout <commit_sha>`
3. Re-deploy the Worker: `npx wrangler deploy --env production`
4. Verify the system resolves the issue using `GET /api/status`.

## D1 Database Schema Rollback

**WARNING**: D1 schema drops or column type changes are highly destructive.

- **Forward Fix**: The primary and safest way to fix a schema issue is to write a _new_ migration that corrects the issue forward (e.g., adding a missing column or index).
- **Hard Revert**: If absolutely necessary and data loss is acceptable (or if restoring from a backup), use the Cloudflare Dashboard to restore the D1 database to an automated snapshot taken before the faulty migration.

## Chrome Extension Rollback

1. Reverting an extension version in the Chrome Web Store is done by uploading the previous ZIP file (or rebuilding from a previous commit) as a new version increment.
2. The Chrome Web Store does not natively support a "rollback" button; you must submit a new version number (e.g., `1.0.2` to replace the broken `1.0.1`) that contains the `1.0.0` code.
3. Await Google Review for the new version.
