# Phase 1A: Worker/Extension Transport Spike

## 1. Objective

Validate the Chrome Extension Manifest V3 structure, popup-to-Worker communication, CORS, and shared schema usage in a local Wrangler environment.

## 2. In scope

- Stubbing `GET /api/status` and `POST /api/subscriptions` on the Worker.
- Explicit OPTIONS/CORS handling on the Worker.
- A basic Chrome extension popup that calls the Worker.

## 3. Out of scope

- D1 database interactions.
- Production UI styling.
- Actual subscription persistence or email sending.

## 4. Inputs/dependencies

- Phase 1 shared schemas and project foundation.

## 5. Outputs/artifacts

- `packages/worker/src/index.ts` with CORS and stub endpoints.
- `packages/extension/src/popup.ts` capable of parsing shared schemas.

## 6. Important domain rules

- CORS `Access-Control-Allow-Origin` must match the specific `chrome-extension://<id>` and not blindly reflect origins.
- `installationId` must not be used as an origin or trusted identity.

## 7. Required tests

- Extension UI/Puppeteer tests to verify end-to-end local transport.
- Worker route tests.

## 8. Acceptance criteria

- Chrome extension successfully fetches from `http://127.0.0.1:8787/api/status`.
- Worker strictly enforces CORS.

## 9. Current status

APPROVED

## 10. Suggested Git branch

`phase-1a-worker-extension-spike`

## 11. Completion evidence or links to reports

- Implemented and verified via end-to-end local test scripts.

## 12. Risks and unresolved questions

- Extension ID will differ in production, requiring configuration injection.
