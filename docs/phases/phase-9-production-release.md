# Phase 9: Production Hardening and Release

## 1. Objective

Deploy the production Worker, configure production D1, configure the email provider, run end-to-end staging tests, and prepare for Chrome Web Store release.

## 2. In scope

- Production environment configuration (`wrangler.toml` envs).
- Secrets management.
- CORS configuration for the production extension ID.
- Monitoring and operational runbooks.
- Staging verification.

## 3. Out of scope

- Feature additions.

## 4. Inputs/dependencies

- All previous phases (1-8).

## 5. Outputs/artifacts

- Deployed Cloudflare Worker.
- Deployed D1 database.
- Chrome Web Store submission package.
- Operational runbooks in `docs/`.

## 6. Important domain rules

- Production data must be strictly isolated from development data.
- Secrets must never be committed to Git.

## 7. Required tests

- End-to-end staging tests against the deployed Worker.

## 8. Acceptance criteria

- System is fully operational in production.
- Extension is approved in the Chrome Web Store.

## 9. Current status

PLANNED

## 10. Suggested Git branch

`phase-9-production-release`

## 11. Completion evidence or links to reports

- N/A

## 12. Risks and unresolved questions

- Chrome Web Store review delays.
