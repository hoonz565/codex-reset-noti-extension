# Phase 6: Notification Delivery

## 1. Objective

Create delivery rows for eligible subscribers, implement the email provider adapter, safely claim pending deliveries, and manage retryable/permanent failures.

## 2. In scope

- Fan-out service to generate `notification_deliveries` rows.
- Email provider adapter (e.g., Resend).
- Safe claim mechanism for pending deliveries.
- Retry logic for provider failures.
- Provider-safe HTML/text templates.

## 3. Out of scope

- Subscriber creation.
- Cycle event detection.

## 4. Inputs/dependencies

- Phase 5 subscriber data.
- Phase 4 event data.

## 5. Outputs/artifacts

- Delivery processor service.
- Email provider integration module.

## 6. Important domain rules

- `sent_to_provider` does not mean `delivered_to_recipient`.
- One delivery per event/subscriber/channel.
- No raw secret or token logging.
- Retry only retryable failures.

## 7. Required tests

- Delivery queue claiming logic (concurrency safety).
- Provider failure handling.
- Template rendering.

## 8. Acceptance criteria

- Deliveries are successfully sent to the provider.
- Duplicate deliveries are prevented.

## 9. Current status

PLANNED

## 10. Suggested Git branch

`phase-6-email-delivery`

## 11. Completion evidence or links to reports

- N/A

## 12. Risks and unresolved questions

- Email provider quotas and deliverability (spam).
