# Email Provider Runbook

## Overview

This runbook covers the integration with the external email provider. The system strictly guards against accidentally emailing real subscribers from development or staging environments.

## Staging Safety

Staging environments **must not** email real subscribers. Staging is made safe via one of the following mechanisms:

1. **Sandbox Mode**: The provider API key is explicitly restricted to a verified sandbox domain that drops or sinks emails.
2. **Forced Test Recipient**: A configuration flag forces all outbound emails to route to an internal engineering inbox.
3. **Neutralization**: The provider abstraction short-circuits sending entirely in staging, logging the intent without making external HTTP requests.

## Production Configuration

- **Provider**: Resend REST API (`POST https://api.resend.com/emails`).
- **Sender Address**: Must be an authorized, verified domain.
- **Secret Binding**: `EMAIL_PROVIDER_API_KEY` (bound via `wrangler secret put`).
- **Non-secret binding**: `EMAIL_FROM_ADDRESS` (for example, `Codex Reset Notifier <alerts@example.com>`).
- Every notification uses its delivery ID as Resend's `Idempotency-Key`.
- Subscription confirmation and management-link emails are sent through the same provider boundary;
  their public API responses remain generic and never expose raw tokens.
- Confirmation links expire after 24 hours. Management links expire after 30 days and open the
  Worker-hosted `/manage` page with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
- **Emergency Disable Switch**: If the provider is misbehaving or compromised, delete the secret or set it to an invalid string `wrangler secret put EMAIL_PROVIDER_API_KEY --env production`. This will cause the provider boundary to throw, pausing orchestration safely for retry later.

## Timeouts and Retries

- API calls to the provider have a 10-second timeout.
- Network errors, 408/409/425/429, and 5xx responses map to retryable failures. Other 4xx responses map to permanent failures.
- Suppressions and hard bounces must be handled to avoid domain reputation damage.

## Sanitization

Provider responses are sanitized. Never return or persist raw provider API responses that might contain the API key or internal provider identifiers outside the expected bounds.
