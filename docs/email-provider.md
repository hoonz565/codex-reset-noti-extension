# Email Provider — Codex Reset Notifier

> **Version:** 1.0 (implemented contract)

## 1. Email categories

The MVP has four email categories but only two subscriber notification events:

| Category                  | Trigger                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- |
| Subscription confirmation | A new or repeated subscription request prepares a 24-hour confirmation token |
| Subscription management   | An existing subscriber requests a 30-day management token                    |
| Probability reached 70%   | `PROBABILITY_REACHED_70`                                                     |
| Reset announced           | `RESET_ANNOUNCED`                                                            |

`PROBABILITY_REACHED_90` and subscriber-facing `RESET_COMPLETED` emails do not exist.

## 2. Provider boundary

The production code uses one provider-neutral interface:

```typescript
interface ProviderEmailRequest {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string;
}

type ProviderEmailResult =
  | { outcome: 'accepted'; providerMessageId: string | null }
  | { outcome: 'retryable_failure'; code: string; retryAfterSeconds: number | null }
  | { outcome: 'permanent_failure'; code: string };

interface EmailProvider {
  send(input: ProviderEmailRequest): Promise<ProviderEmailResult>;
}
```

Environment selection is explicit:

- Development/tests: `MockEmailProvider` records calls without network access.
- Staging: `DisabledEmailProvider` sinks the intent and performs no network request.
- Production: `ConfiguredEmailProvider` sends through Resend.

## 3. Production Resend adapter

The adapter calls `POST https://api.resend.com/emails` with bearer authentication. It requires:

- secret `EMAIL_PROVIDER_API_KEY`;
- non-secret `EMAIL_FROM_ADDRESS` on a verified sending domain.

Requests have a 10-second timeout. Notification deliveries use the delivery ID as Resend's
`Idempotency-Key`. Provider response bodies and credentials are never logged or persisted.

Response classification:

- network errors, 408, 409, 425, 429, and 5xx: retryable;
- other 4xx responses: permanent;
- malformed 2xx responses: retryable;
- `Retry-After`: accepted as seconds or an HTTP date, bounded to 24 hours by the adapter and to one
  hour by delivery scheduling.

## 4. Delivery retry policy

Notification delivery attempts are persisted per subscriber/event/channel. A claim token prevents a
stale worker from finalizing a newer claim.

| Failed attempt | Next default attempt        |
| -------------- | --------------------------- |
| 1              | +1 minute                   |
| 2              | +5 minutes                  |
| 3              | +15 minutes                 |
| 4              | +1 hour                     |
| 5              | Terminal `failed_permanent` |

Retry updates the existing delivery row; it never creates a second row. A five-minute recovery lease
returns abandoned `processing` rows to `pending` without invoking the email provider.

## 5. Subscription email flow

Raw confirmation and management tokens are never returned by public request endpoints or stored in
D1. The service stores SHA-256 hashes and sends raw tokens only in HTTPS links:

- `/confirm?token=...` displays a confirmation button; GET does not consume the token;
- after confirmation, the browser receives a new management token and navigates to `/manage?token=...`;
- `/manage` can request a new link, update exactly two preferences, or unsubscribe.

The hosted pages use a restrictive CSP, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and
frame denial.

## 6. Notification template requirements

Both notification templates include:

- the observed event information;
- a link to `willcodexquotareset.com` as the upstream source;
- a manage/unsubscribe link;
- the disclaimer “Unofficial community tool. Not affiliated with OpenAI.”

The 70% message states the observed probability and does not claim certainty or timing. The announced
message states that the reset is announced but may not have completed.

## 7. Operational policy

- Use a verified domain with SPF, DKIM, and DMARC.
- Monitor retry backlog, permanent failures, rate limits, and provider errors.
- Do not add a provider webhook or a second provider without a separately approved phase.
- To stop production sending, remove/rotate `EMAIL_PROVIDER_API_KEY`; delivery processing will fail
  closed and retry according to policy.

For deployment details, see [the production email runbook](runbooks/email-provider.md).
