# Phase 5: Subscription Management

## 1. Objective

Implement subscription creation, the confirmation flow (double opt-in), management tokens, preference updates, and abuse protection primitives.

## 2. In scope

- Subscriber creation with unconfirmed state.
- Double opt-in confirmation endpoint.
- Subscriber preference update endpoints.
- Unsubscribe endpoint.
- Rate limiting and cooldown for confirmation emails.
- Management token generation and hashing.

## 3. Out of scope

- Delivery of notification emails.
- Extension UI.

## 4. Inputs/dependencies

- Phase 2 subscriber persistence layer.
- Phase 1 API schemas.

## 5. Outputs/artifacts

- Subscriber API routes on the Worker.
- Token hashing utility.
- Abuse protection (Rate limiting integration).

## 6. Important domain rules

- Store token hashes only, never raw secrets.
- Never trust `installationId` as authentication.
- Explicit `probability70` and `resetAnnounced` preferences only.
- Normalize email addresses.

## 7. Required tests

- Token generation and verification.
- Double opt-in state transitions.
- Abuse protection scenarios (rate limits).

## 8. Acceptance criteria

- Subscribers can confirm, manage, and unsubscribe securely.
- Abuse vectors (spamming confirmation) are mitigated.

## 9. Current status

APPROVED

## 10. Suggested Git branch

`phase-5-subscription-management`

## 11. Completion evidence or links to reports

- Implementation: commit `fa02cbc` (`feat: implement Phase 5 subscription management`).
- Confirmation delivery, management-link delivery, and hosted secure management UI are covered by
  the current [Phase 9 verification report](../../phase-9-report.md).

## 12. Risks and unresolved questions

- Security of HMAC secrets and token lifecycle.
