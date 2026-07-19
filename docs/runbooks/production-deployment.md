# Production Deployment Runbook

## Overview

This runbook defines the explicitly gated procedure for deploying to the Production environment.

## Prerequisites (Gate A & B)

- **Local Readiness**: All tests pass (`npm test`). Build succeeds.
- **Staging Deployment**: The staging environment must be deployed and validated.

## Production Approval (Gate C)

Stop and request explicit approval from the tech lead or engineering manager before proceeding with any of the following commands.

## Deployment Steps

1. **Apply Migrations**
   ```bash
   npx wrangler d1 migrations apply DB --env production
   ```
2. **Deploy Worker**
   ```bash
   npx wrangler deploy --env production
   ```
3. **Verify Deployment**
   - Execute a sanity check against `GET https://<PRODUCTION_URL>/api/status`
   - Verify the response is a valid `schemaVersion: 1` payload.
