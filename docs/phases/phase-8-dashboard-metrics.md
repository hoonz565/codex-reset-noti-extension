# Phase 8: Final Extension Product UI

## 1. Objective

Replace the transport-spike UI with the final production extension UI. Display current reset status, source health, and implement the subscription management flows.

## 2. In scope

- Final visual design for the Chrome Extension popup.
- Displaying current status (probability, lifecycle, health).
- Form for subscribing (with exactly two alert options).
- Handling unconfirmed, active, and unsubscribed states visually.
- Displaying recoverable errors.

## 3. Out of scope

- Backend API changes (unless strictly necessary to support the UI).
- Source fetching.

## 4. Inputs/dependencies

- Phase 7 deployed backend.
- Phase 5 subscription API.

## 5. Outputs/artifacts

- Final Chrome extension in `packages/extension/`.

## 6. Important domain rules

- Exactly two alert options.
- No direct access to the source website from the extension.
- Production manifest must exclude localhost permissions.
- Backend responses must still be runtime validated.

## 7. Required tests

- UI component tests.
- Extension end-to-end flows.

## 8. Acceptance criteria

- The extension accurately reflects the backend state.
- Users can subscribe and manage their settings cleanly.

## 9. Current status

PLANNED

## 10. Suggested Git branch

`phase-8-extension-ui`

## 11. Completion evidence or links to reports

- N/A

## 12. Risks and unresolved questions

- Chrome Web Store review process.
