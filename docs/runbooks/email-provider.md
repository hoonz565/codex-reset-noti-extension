# Email Provider Runbook

## Overview

This runbook covers the integration with the external email provider. The system strictly guards against accidentally emailing real subscribers from development or staging environments.

## Staging Safety

Staging environments **must not** email real subscribers. Staging is made safe via one of the following mechanisms:

1. **Sandbox Mode**: The provider API key is explicitly restricted to a verified sandbox domain that drops or sinks emails.
2. **Forced Test Recipient**: A configuration flag forces all outbound emails to route to an internal engineering inbox.
3. **Neutralization**: The provider abstraction short-circuits sending entirely in staging, logging the intent without making external HTTP requests.

## Production Configuration

- **Provider**: Resend (or equivalent configured via `EMAIL_PROVIDER_API_KEY`).
- **Sender Address**: Must be an authorized, verified domain.
- **Secret Binding**: `EMAIL_PROVIDER_API_KEY` (bound via `wrangler secret put`).
- **Emergency Disable Switch**: If the provider is misbehaving or compromised, delete the secret or set it to an invalid string `wrangler secret put EMAIL_PROVIDER_API_KEY --env production`. This will cause the provider boundary to throw, pausing orchestration safely for retry later.

## Timeouts and Retries

- API calls to the provider are timed out quickly.
- Unsuccessful API calls map to `FAILED_RETRYABLE` (500s) or `FAILED_PERMANENT` (400s or suppression list hits).
- Suppressions and hard bounces must be handled to avoid domain reputation damage.

## Sanitization

Provider responses are sanitized. Never return or persist raw provider API responses that might contain the API key or internal provider identifiers outside the expected bounds.
