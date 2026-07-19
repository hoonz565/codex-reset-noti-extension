# Phase 8 Verification Report

## 1. Test Suite Exit Codes

- `npm run format:check`: Exit Code 0
- `npm run lint`: Exit Code 0
- `npm run typecheck`: Exit Code 0
- `npm run test`: Exit Code 0
- `npm run build`: Exit Code 0

## 2. Totals

- Shared tests: 24
- Extension tests: 32
- Worker tests: 600
- Phase 8-specific tests: 96
- Monorepo total: 656
- Test files: 78
- Todo: 0
- Skipped: 0
- Build result per workspace: SUCCESS (extension, shared, worker)

## 3. Evidence Table (96 Rows)

| ID | Original Requirement Text | Exact Test Name | Test File | Assertion Summary | Type | Status |
|---|---|---|---|---|---|---|
| DASH-STATUS-1 | Fresh trusted snapshot returns state=fresh. | DASH-STATUS-1: Fresh trusted snapshot returns state=fresh. | `status-read-service.test.ts` | Mocks trusted snapshot within 600s, invokes read service, asserts state is explicitly 'fresh'. | Unit | PASS |
| DASH-STATUS-2 | Fresh response includes the persisted probability. | DASH-STATUS-2: Fresh response includes the persisted probability. | `status-read-service.test.ts` | Mocks trusted snapshot with probability 80, asserts returned probability is exactly 80. | Unit | PASS |
| DASH-STATUS-3 | RESET_ANNOUNCED is read from persisted event/lifecycle evidence and is not inferred from probability. | DASH-STATUS-3: RESET_ANNOUNCED is read from persisted event/lifecycle evidence and is not inferred from probability. | `status-read-service.test.ts` | Mocks RESET_ANNOUNCED event, asserts resetAnnounced is true regardless of probability. | Unit | PASS |
| DASH-STATUS-4 | Persisted unavailable evidence returns state=unavailable. | DASH-STATUS-4: Persisted unavailable evidence returns state=unavailable. | `status-read-service.test.ts` | Mocks missing or invalid snapshot, invokes read service, asserts state is explicitly 'unavailable'. | Unit | PASS |
| DASH-STATUS-5 | Old trusted evidence returns state=stale. | DASH-STATUS-5: Old trusted evidence returns state=stale. | `status-read-service.test.ts` | Mocks trusted snapshot older than 600s, invokes read service, asserts state is explicitly 'stale'. | Unit | PASS |
| DASH-STATUS-6 | Stale probability is preserved only with state=stale. | DASH-STATUS-6: Stale probability is preserved only with state=stale. | `status-read-service.test.ts` | Mocks stale snapshot with probability 50, asserts state is stale and probability is preserved. | Unit | PASS |
| DASH-STATUS-7 | No snapshots return state=empty. | DASH-STATUS-7: No snapshots return state=empty. | `status-read-service.test.ts` | Mocks empty DB, invokes read service, asserts state is explicitly 'empty'. | Unit | PASS |
| DASH-STATUS-8 | Malformed or future timestamps fail safely. | DASH-STATUS-8: Malformed or future timestamps fail safely. | `status-read-service.test.ts` | Mocks future checked_at timestamp, asserts it gracefully falls back to unavailable. | Unit | PASS |
| DASH-STATUS-9 | resetCycleId corresponds to the current latestResetAt cycle. | DASH-STATUS-9: resetCycleId corresponds to the current latestResetAt cycle. | `status-read-service.test.ts` | Mocks reset cycle c1, invokes read service, asserts resetCycleId equals 'c1'. | Unit | PASS |
| DASH-STATUS-10 | Status read model performs no writes and no upstream requests. | DASH-STATUS-10: Status read model performs no writes and no upstream requests. | `status-read-service.test.ts` | Invokes read service, asserts DB transaction executes only SELECT statements and zero upstream fetch calls. | Unit | PASS |
| DASH-API-1 | GET /api/status returns schemaVersion 1 | DASH-API-1: GET /api/status returns schemaVersion 1 | `status-routes.test.ts` | Fetches GET /api/status, parses JSON, asserts schemaVersion strictly equals 1. | Worker Integration | PASS |
| DASH-API-2 | POST /api/status returns 405 Method Not Allowed | DASH-API-2: POST /api/status returns 405 Method Not Allowed | `status-routes.test.ts` | Fetches POST /api/status, asserts HTTP status code strictly equals 405. | Worker Integration | PASS |
| DASH-API-3 | GET /api/status includes valid CORS headers | DASH-API-3: GET /api/status includes valid CORS headers | `status-routes.test.ts` | Fetches GET /api/status, asserts Access-Control-Allow-Origin header matches allowed list. | Worker Integration | PASS |
| DASH-API-4 | Unavailable is a valid status response | DASH-API-4: Unavailable is a valid status response | `status-routes.test.ts` | Mocks unavailable state, fetches GET /api/status, asserts state is 'unavailable'. | Worker Integration | PASS |
| DASH-API-5 | Repository failures are sanitized and return 500 without leaking details | DASH-API-5: Repository failures are sanitized and return 500 without leaking details | `status-routes.test.ts` | Mocks DB throw, fetches GET /api/status, asserts HTTP status code 500 without leaking error stack. | Worker Integration | PASS |
| DASH-API-6 | Public status response contains no subscriber or secret data | DASH-API-6: Public status response contains no subscriber or secret data | `status-routes.test.ts` | Fetches GET /api/status, parses JSON, asserts absence of PII, tokens, or subscriber arrays. | Worker Integration | PASS |
| DASH-API-7 | GET /api/status includes correct Cache-Control policy | DASH-API-7: GET /api/status includes correct Cache-Control policy | `status-routes.test.ts` | Fetches GET /api/status, asserts Cache-Control header strictly equals public, max-age=30, stale-while-revalidate=60. | Worker Integration | PASS |
| DASH-API-8 | Status routes perform no upstream source or orchestration fetch | DASH-API-8: Status routes perform no upstream source or orchestration fetch | `status-routes.test.ts` | Fetches GET /api/status, asserts zero fetch calls to source or orchestration URLs. | Worker Integration | PASS |
| DASH-API-9 | Public status responses are bounded strictly to the contract | DASH-API-9: Public status responses are bounded strictly to the contract | `status-routes.test.ts` | Fetches GET /api/status, asserts Object.keys matches exact shared schema properties with no excess fields. | Worker Integration | PASS |
| DASH-API-10 | OPTIONS request is handled with appropriate CORS headers | DASH-API-10: OPTIONS request is handled with appropriate CORS headers | `status-routes.test.ts` | Fetches OPTIONS /api/status, asserts HTTP status 204 with CORS headers. | Worker Integration | PASS |
| DASH-METRICS-1 | Default metrics window is applied. | DASH-METRICS-1: Default metrics window is applied. | `metrics-routes.test.ts` | Fetches GET /api/admin/metrics without window param, asserts factory called exactly with '24h'. | Worker Integration | PASS |
| DASH-METRICS-2 | Supported windows 1h, 24h, and 7d are accepted. | DASH-METRICS-2: Supported windows 1h, 24h, and 7d are accepted. | `metrics-read-service.test.ts` | Invokes getMetrics('1h'), '24h', and '7d', asserts orchestration started_at and reset-event created_at filter exactly by lower bounds, and delivery state counts reflect current global state. | Unit | PASS |
| DASH-METRICS-3 | Unsupported window is rejected. | DASH-METRICS-3: Unsupported window is rejected. | `metrics-routes.test.ts` | Invokes getMetrics('invalid'), asserts promise rejects with invalid window error. | Worker Integration | PASS |
| DASH-METRICS-4 | Orchestration status counts are correct. | DASH-METRICS-4: Orchestration status counts are correct. | `metrics-read-service.test.ts` | Seeds 3 completed runs, invokes read service, asserts orchestration.completed equals 3. | Unit | PASS |
| DASH-METRICS-5 | Latest orchestration outcome is correct. | DASH-METRICS-5: Latest orchestration outcome is correct. | `metrics-read-service.test.ts` | Seeds mixed outcomes (completed, skipped_overlap, running), invokes read service, asserts orchestration.latestStatus exactly matches 'completed' with correct latestFinishedAt. | Unit | PASS |
| DASH-METRICS-6 | Delivery state counts are correct. | DASH-METRICS-6: Delivery state counts are correct. | `metrics-read-service.test.ts` | Seeds 2 pending deliveries, invokes read service, asserts deliveries.pending equals 2. | Unit | PASS |
| DASH-METRICS-7 | Due pending delivery count is correct. | DASH-METRICS-7: Due pending delivery count is correct. | `metrics-query-bounds.test.ts` | Seeds 1 due delivery, invokes read service, asserts deliveries.duePending equals 1. | Unit | PASS |
| DASH-METRICS-8 | Stale processing delivery count is correct. | DASH-METRICS-8: Stale processing delivery count is correct. | `metrics-query-bounds.test.ts` | Seeds 1 processing delivery older than 300s, invokes read service, asserts deliveries.staleProcessing equals 1. | Unit | PASS |
| DASH-METRICS-9 | Subscriber event counts include only: PROBABILITY_REACHED_70, RESET_ANNOUNCED | DASH-METRICS-9: Subscriber event counts include only: PROBABILITY_REACHED_70, RESET_ANNOUNCED | `metrics-query-bounds.test.ts` | Seeds RESET_ANNOUNCED, PROBABILITY_REACHED_70, and valid excluded non-subscriber event SYSTEM_STARTUP, invokes read service, asserts only subscriber events are counted. | Unit | PASS |
| DASH-METRICS-10 | Metrics service returns no raw rows or PII. | DASH-METRICS-10: Metrics service returns no raw rows or PII. | `metrics-query-bounds.test.ts` | Invokes getMetrics, asserts returned object contains only aggregate counts and zero raw subscriber rows. | Unit | PASS |
| DASH-METRICS-11 | All time-window queries are bounded. | DASH-METRICS-11: All time-window queries are bounded. | `metrics-query-bounds.test.ts` | Invokes getMetrics, asserts orchestration and canonical event aggregates use selected window, while stale processing strictly uses its own lease cutoff. | Unit | PASS |
| DASH-METRICS-12 | Metrics read model performs no writes, provider calls, or orchestration. | DASH-METRICS-12: Metrics read model performs no writes, provider calls, or orchestration. | `metrics-query-bounds.test.ts` | Invokes getMetrics, asserts zero INSERT/UPDATE queries and zero upstream fetch calls executed. | Unit | PASS |
| DASH-ADMIN-1 | missing authorization header returns 401 | DASH-ADMIN-1: missing authorization header returns 401 | `metrics-routes.test.ts` | Fetches GET /api/admin/metrics without token, asserts HTTP 401. | Worker Integration | PASS |
| DASH-ADMIN-2 | invalid authorization header returns 401 | DASH-ADMIN-2: invalid authorization header returns 401 | `metrics-routes.test.ts` | Fetches GET /api/admin/metrics with invalid token, asserts HTTP 401. | Worker Integration | PASS |
| DASH-ADMIN-3 | valid bearer returns metrics | DASH-ADMIN-3: valid bearer returns metrics | `metrics-routes.test.ts` | Fetches GET /api/admin/metrics with valid token, asserts HTTP 200 and schemaVersion 1. | Worker Integration | PASS |
| DASH-ADMIN-4 | forbidden Origin rejected before queries | DASH-ADMIN-4: forbidden Origin rejected before queries | `metrics-routes.test.ts` | Fetches GET /api/admin/metrics with forbidden Origin, asserts HTTP 403 before any queries. | Worker Integration | PASS |
| DASH-ADMIN-5 | allowed Origin without token unauthorized | DASH-ADMIN-5: allowed Origin without token unauthorized | `metrics-routes.test.ts` | Fetches GET /api/admin/metrics with valid Origin but no token, asserts HTTP 401. | Worker Integration | PASS |
| DASH-ADMIN-6 | no-Origin still requires bearer | DASH-ADMIN-6: no-Origin still requires bearer | `metrics-routes.test.ts` | Fetches GET /api/admin/metrics with no Origin but missing token, asserts HTTP 401. | Worker Integration | PASS |
| DASH-ADMIN-7 | unsupported method rejected | DASH-ADMIN-7: unsupported method rejected | `metrics-routes.test.ts` | Fetches POST /api/admin/metrics with valid token, asserts HTTP 405. | Worker Integration | PASS |
| DASH-ADMIN-8 | unsupported window rejected | DASH-ADMIN-8: unsupported window rejected | `metrics-routes.test.ts` | Fetches GET /api/admin/metrics?window=invalid, asserts service rejection maps strictly to HTTP 400. | Worker Integration | PASS |
| DASH-ADMIN-9 | token absent from response and logs | DASH-ADMIN-9: token absent from response and logs | `metrics-routes.test.ts` | Fetches GET /api/admin/metrics, asserts token string is absent from response body and mock console logs. | Worker Integration | PASS |
| DASH-ADMIN-10 | subscriber/management/installation tokens cannot authorize | DASH-ADMIN-10: subscriber/management/installation tokens cannot authorize | `metrics-routes.test.ts` | Fetches GET /api/admin/metrics with subscriber token, asserts HTTP 401. | Worker Integration | PASS |
| DASH-ADMIN-11 | reuses Phase 7 admin auth | DASH-ADMIN-11: reuses Phase 7 admin auth | `metrics-routes.test.ts` | Fetches GET /api/admin/metrics with Phase 7 env ADMIN_API_TOKEN, asserts HTTP 200. | Worker Integration | PASS |
| DASH-ADMIN-12 | response schema-valid and bounded | DASH-ADMIN-12: response schema-valid and bounded | `metrics-routes.test.ts` | Fetches GET /api/admin/metrics, asserts parsed JSON keys strictly match AdminMetricsResponse interface. | Worker Integration | PASS |
| DASH-CLIENT-1 | only Worker /api/status is requested | DASH-CLIENT-1: only Worker /api/status is requested | `status-client.test.ts` | Mocks global fetch, calls getStatus(), asserts fetch called with exact URL http://test.local/api/status. | Extension Integration | PASS |
| DASH-CLIENT-2 | upstream source is never requested | DASH-CLIENT-2: upstream source is never requested | `status-client.test.ts` | Mocks global fetch, calls getStatus(), asserts fetch never called with upstream source.example.com. | Extension Integration | PASS |
| DASH-CLIENT-3 | valid response runtime-validates | DASH-CLIENT-3: valid response runtime-validates | `status-client.test.ts` | Mocks global fetch returning valid schema, calls getStatus(), asserts returned object strictly matches input. | Extension Integration | PASS |
| DASH-CLIENT-4 | invalid schema maps to typed error | DASH-CLIENT-4: invalid schema maps to typed error | `status-client.test.ts` | Mocks global fetch returning missing fields, calls getStatus(), asserts throws typed Invalid response format error. | Extension Integration | PASS |
| DASH-CLIENT-5 | network failure maps to typed error | DASH-CLIENT-5: network failure maps to typed error | `status-client.test.ts` | Mocks global fetch rejecting, calls getStatus(), asserts throws typed Network error. | Extension Integration | PASS |
| DASH-CLIENT-6 | timeout aborts safely | DASH-CLIENT-6: timeout aborts safely | `status-client.test.ts` | Mocks fake timers and fetch promise pending AbortSignal, captures signal, advances timers by 11000ms, asserts signal.aborted === true, asserts typed Network error: Timeout, asserts vi.getTimerCount() === 0, and asserts subsequent call invokes fetch 2 times. | Extension Integration | PASS |
| DASH-CLIENT-7 | concurrent calls reuse the in-flight promise | DASH-CLIENT-7: concurrent calls reuse the in-flight promise | `status-client.test.ts` | Mocks delayed fetch, calls getStatus() twice concurrently, asserts global fetch called exactly once. | Extension Integration | PASS |
| DASH-CLIENT-8 | no response body, token or secret is logged | DASH-CLIENT-8: no response body, token or secret is logged | `status-client.test.ts` | Mocks fetch, calls getStatus(), asserts console.log is never called with response body or tokens. | Extension Integration | PASS |
| DASH-VIEW-1 | loading exclusive - loading state is visually exclusive | DASH-VIEW-1: loading exclusive - loading state is visually exclusive | `status-view-model.test.ts` | Mounts StatusDashboard with loading state, asserts .loading is visually present and distinct. | Extension Integration | PASS |
| DASH-VIEW-2 | fresh probability - fresh probability is accurately presented | DASH-VIEW-2: fresh probability - fresh probability is accurately presented | `status-view-model.test.ts` | Mounts StatusDashboard with 80% probability, asserts DOM textContent includes exactly 80%. | Extension Integration | PASS |
| DASH-VIEW-3 | stale label - stale probability is presented with a stale label | DASH-VIEW-3: stale label - stale probability is presented with a stale label | `status-view-model.test.ts` | Mounts StatusDashboard with stale state, asserts DOM textContent includes exactly STALE label. | Extension Integration | PASS |
| DASH-VIEW-4 | unavailable không giả fresh - unavailable does not pretend to be fresh | DASH-VIEW-4: unavailable không giả fresh - unavailable does not pretend to be fresh | `status-view-model.test.ts` | Mounts StatusDashboard with unavailable state, asserts DOM textContent excludes fresh indicators. | Extension Integration | PASS |
| DASH-VIEW-5 | announcement copy precedence - announcement copy takes visual precedence over probability | DASH-VIEW-5: announcement copy precedence - announcement copy takes visual precedence over probability | `status-view-model.test.ts` | Mounts StatusDashboard with announced true, asserts DOM textContent emphasizes ANNOUNCED over probability. | Extension Integration | PASS |
| DASH-VIEW-6 | 100% không suy ra announced - 100% probability does not infer announced state | DASH-VIEW-6: 100% không suy ra announced - 100% probability does not infer announced state | `status-view-model.test.ts` | Mounts StatusDashboard with 100% and announced false, asserts DOM textContent excludes ANNOUNCED. | Extension Integration | PASS |
| DASH-VIEW-7 | empty khác unavailable - empty state is visually distinct from unavailable state | DASH-VIEW-7: empty khác unavailable - empty state is visually distinct from unavailable state | `status-view-model.test.ts` | Mounts StatusDashboard with empty state, asserts DOM visual class differs from unavailable. | Extension Integration | PASS |
| DASH-VIEW-8 | API error khác source unavailable - API error is visually distinct from source unavailable | DASH-VIEW-8: API error khác source unavailable - API error is visually distinct from source unavailable | `status-view-model.test.ts` | Mounts StatusDashboard with API error, asserts DOM visual class differs from source unavailable. | Extension Integration | PASS |
| DASH-VIEW-9 | invalid timestamp không crash - invalid timestamp does not crash the UI | DASH-VIEW-9: invalid timestamp không crash - invalid timestamp does not crash the UI | `status-view-model.test.ts` | Mounts StatusDashboard with invalid date string, asserts DOM parses safely without throwing. | Extension Integration | PASS |
| DASH-VIEW-10 | refresh giữ prior state - refreshing preserves prior state visually | DASH-VIEW-10: refresh giữ prior state - refreshing preserves prior state visually | `status-view-model.test.ts` | Mounts StatusDashboard, updates state, asserts prior DOM state is preserved under old-data-overlay. | Extension Integration | PASS |
| DASH-A11Y-1 | semantic heading | DASH-A11Y-1: semantic heading | `status-dashboard.test.ts` | Mounts StatusDashboard, asserts container.querySelector('h2') text exactly equals System Status. | Extension Integration | PASS |
| DASH-A11Y-2 | readable non-color-only badge | DASH-A11Y-2: readable non-color-only badge | `status-dashboard.test.ts` | Mounts StatusDashboard, asserts .status-badge textContent is readable text (e.g. State: FRESH). | Extension Integration | PASS |
| DASH-A11Y-3 | keyboard-accessible refresh control | DASH-A11Y-3: keyboard-accessible refresh control | `status-dashboard.test.ts` | Mounts StatusDashboard, clears mock, focuses #refresh-status-btn, presses '{Enter}', asserts 1 call, clears mock, presses ' ', and asserts 1 call. | Extension Integration | PASS |
| DASH-A11Y-4 | accessible loading text | DASH-A11Y-4: accessible loading text | `status-dashboard.test.ts` | Mounts StatusDashboard with loading state, asserts .loading has role="status" and aria-busy="true", and asserts .sr-only region text is exactly "Loading status...". | Extension Integration | PASS |
| DASH-A11Y-5 | screen-reader distinction between error and unavailable | DASH-A11Y-5: screen-reader distinction between error and unavailable | `status-dashboard.test.ts` | Mounts StatusDashboard, asserts .status-unavailable .sr-only text is "Source unavailable:", and asserts .status-error .sr-only text is "API Error:". | Extension Integration | PASS |
| DASH-A11Y-6 | accessible absolute timestamp for relative time | DASH-A11Y-6: accessible absolute timestamp for relative time | `status-dashboard.test.ts` | Mounts StatusDashboard, asserts semantic <time> tag datetime parses as "2023-01-01T12:00:00.000Z", and asserts visible text content contains relative "Checked recently". | Extension Integration | PASS |
| DASH-SEC-1 | Public status response contains no raw email. | DASH-SEC-1: Public status response contains no raw email. | `dash-sec-canonical.test.ts` | Injects phase8-email@example.invalid into internal db, serializes public /api/status response, and asserts 0 occurrences. | Unit | PASS |
| DASH-SEC-2 | Public status response contains no subscriber or installation ID. | DASH-SEC-2: Public status response contains no subscriber or installation ID. | `dash-sec-canonical.test.ts` | Injects sub-sentinel-123 into internal db, serializes public /api/status response, and asserts 0 occurrences. | Unit | PASS |
| DASH-SEC-3 | Public status response contains no confirmation or management token. | DASH-SEC-3: Public status response contains no confirmation or management token. | `dash-sec-canonical.test.ts` | Injects mgmt-sentinel-token into internal db, serializes public /api/status response, and asserts 0 occurrences. | Unit | PASS |
| DASH-SEC-4 | Admin metrics response contains no individual subscriber row. | DASH-SEC-4: Admin metrics response contains no individual subscriber row. | `dash-sec-canonical.test.ts` | Seeds exactly 1 subscriber row sub-sec-4, invokes /api/admin/metrics, and asserts 0 occurrences of subscriber ID or email in response. | Unit | PASS |
| DASH-SEC-5 | Authorization header is never logged. | DASH-SEC-5: Authorization header is never logged. | `dash-sec-canonical.test.ts` | Sends Authorization Bearer SENTINEL_SECRET_TOKEN, intercepts console.log/warn/error, and asserts 0 occurrences in logs. | Unit | PASS |
| DASH-SEC-6 | All status and metrics SQL values use bound parameters. | DASH-SEC-6: All status and metrics SQL values use bound parameters. | `dash-sec-canonical.test.ts` | Captures db.prepare(sql) and bind(...values); asserts dynamic inputs are absent from SQL strings and present only in bound arguments. | Unit | PASS |
| DASH-SEC-7 | Raw upstream payload is never returned or persisted by Phase 8. | DASH-SEC-7: Raw upstream payload is never returned or persisted by Phase 8. | `dash-sec-canonical.test.ts` | Seeds SENTINEL_UPSTREAM_PAYLOAD_38f29c hash, invokes /api/status, and asserts 0 occurrences in response or persistence queries. | Unit | PASS |
| DASH-SEC-8 | Provider credentials and provider-native responses are absent. | DASH-SEC-8: Provider credentials and provider-native responses are absent. | `dash-sec-canonical.test.ts` | Scans combined metricsRoutesRaw and statusRoutesRaw, asserts 0 occurrences of SENDGRID_API_KEY or provider_ constants. | Unit | PASS |
| DASH-SEC-9 | CORS does not authorize admin metrics. | DASH-SEC-9: CORS does not authorize admin metrics. | `dash-sec-canonical.test.ts` | Sends Authorization Bearer wrong-token with Origin https://trusted.com to /api/admin/metrics, asserts HTTP 401, and asserts getMetrics factory is called 0 times. | Unit | PASS |
| DASH-SEC-10 | No real secret is committed in source, fixtures, docs, or wrangler.toml. | DASH-SEC-10: No real secret is committed in source, fixtures, docs, or wrangler.toml. | `dash-sec-canonical.test.ts` | Scans source, tests, fixtures, docs, wrangler.toml, package.json after applying placeholder allowlist, and asserts 0 occurrences of long bearer/API values, SG.-prefixed credentials, sk_live_ secrets, or provider credentials. | Unit | PASS |
| DASH-BOUNDARY-1 | Phase 8 performs no upstream source fetch. | DASH-BOUNDARY-1: Phase 8 performs no upstream source fetch. | `dash-boundary-canonical.test.ts` | Spies on global fetch during GET /api/status request, asserts exactly 0 fetch calls are invoked. | Unit | PASS |
| DASH-BOUNDARY-2 | Phase 8 creates no source snapshot. | DASH-BOUNDARY-2: Phase 8 creates no source snapshot. | `dash-boundary-canonical.test.ts` | Counts source_snapshots before and after GET /api/status, asserts row count remains exactly equal. | Unit | PASS |
| DASH-BOUNDARY-3 | Phase 8 creates no reset event or cycle. | DASH-BOUNDARY-3: Phase 8 creates no reset event or cycle. | `dash-boundary-canonical.test.ts` | Counts reset_events and reset_cycles before and after GET /api/status, asserts row counts remain exactly equal. | Unit | PASS |
| DASH-BOUNDARY-4 | Phase 8 creates no notification delivery. | DASH-BOUNDARY-4: Phase 8 creates no notification delivery. | `dash-boundary-canonical.test.ts` | Seeds FK hierarchy (c1, s1, e1, sub1) and 1 pending notification_deliveries row (del-1), invokes GET /api/status and /api/admin/metrics, asserts exactly 0 preparation or insert calls, and asserts before/after notification_deliveries count remains exactly 1. | Unit | PASS |
| DASH-BOUNDARY-5 | Phase 8 sends no email. | DASH-BOUNDARY-5: Phase 8 sends no email. | `dash-boundary-canonical.test.ts` | Invokes GET /api/status and authenticated GET /api/admin/metrics, spies on email provider send boundary, asserts send call count is exactly 0, scans statusRaw and metricsRaw, and asserts 0 occurrences of sendEmail, EmailProvider, or DeliveryDispatch. | Unit | PASS |
| DASH-BOUNDARY-6 | No probability90 behavior exists. | DASH-BOUNDARY-6: No probability90 behavior exists. | `dash-boundary-canonical.test.ts` | Scans indexRaw, asserts 0 occurrences of PROBABILITY_REACHED_90 or notify_90. | Unit | PASS |
| DASH-BOUNDARY-7 | No RESET_COMPLETED subscriber notification exists. | DASH-BOUNDARY-7: No RESET_COMPLETED subscriber notification exists. | `dash-boundary-canonical.test.ts` | Scans indexRaw, asserts 0 occurrences of RESET_COMPLETED. | Unit | PASS |
| DASH-BOUNDARY-8 | No Cloudflare Queue implementation is added. | DASH-BOUNDARY-8: No Cloudflare Queue implementation is added. | `dash-boundary-canonical.test.ts` | Scans wranglerRaw, asserts 0 occurrences of [queues] or [[queues.consumers]]. | Unit | PASS |
| DASH-BOUNDARY-9 | No provider webhook endpoint is added. | DASH-BOUNDARY-9: No provider webhook endpoint is added. | `dash-boundary-canonical.test.ts` | Inspects indexRaw for route registry, asserts 0 occurrences of /webhook, /callback, or SignatureVerification. | Unit | PASS |
| DASH-BOUNDARY-10 | No Phase 9 functionality is added. | DASH-BOUNDARY-10: No Phase 9 functionality is added. | `dash-boundary-canonical.test.ts` | Inspects indexRaw and wranglerRaw, excludes Phase 9 roadmap references, and asserts 0 occurrences of Phase 9 functionality. | Unit | PASS |
| MIG-DASH-1 | Clean migration chain applies 0001 through 0007 | MIG-DASH-1: Clean migration chain applies 0001 through 0007 | `0007-migration.test.ts` | Evaluates clean D1 test database applies 0001 through 0007 successfully without throwing. | Migration Integration | PASS |
| MIG-DASH-2 | Upgrade from 0006 to 0007 succeeds | MIG-DASH-2: Upgrade from 0006 to 0007 succeeds | `0007-migration.test.ts` | Evaluates D1 test database upgrade from 0006 to 0007 succeeds with exit 0. | Migration Integration | PASS |
| MIG-DASH-3 | Existing rows are preserved | MIG-DASH-3: Existing rows are preserved | `0007-migration.test.ts` | Evaluates existing notification_deliveries rows are preserved after migration by counting exactly 1 row. | Migration Integration | PASS |
| MIG-DASH-4 | idx_orch_runs_started_status exists | MIG-DASH-4: idx_orch_runs_started_status exists | `0007-migration.test.ts` | Queries sqlite_master, asserts index idx_orch_runs_started_status strictly exists. | Migration Integration | PASS |
| MIG-DASH-5 | idx_reset_events_type_created exists | MIG-DASH-5: idx_reset_events_type_created exists | `0007-migration.test.ts` | Queries sqlite_master, asserts index idx_reset_events_type_created strictly exists. | Migration Integration | PASS |
| MIG-DASH-6 | idx_deliveries_processing_started exists | MIG-DASH-6: idx_deliveries_processing_started exists | `0007-migration.test.ts` | Queries sqlite_master, asserts index idx_deliveries_processing_started strictly exists. | Migration Integration | PASS |
| MIG-DASH-7 | The exact Phase 8 target queries use the intended indexes under EXPLAIN QUERY PLAN | MIG-DASH-7: The exact Phase 8 target queries use the intended indexes under EXPLAIN QUERY PLAN | `0007-migration.test.ts` | Executes EXPLAIN QUERY PLAN on production SQL, asserts orchestration window aggregation uses idx_orch_runs_started_status, canonical reset-event window uses idx_reset_events_type_created, and stale-processing count uses idx_deliveries_processing_started. | Migration Integration | PASS |
| MIG-DASH-8 | A second migration run has no pending migration and does not duplicate indexes | MIG-DASH-8: A second migration run has no pending migration and does not duplicate indexes | `0007-migration.test.ts` | Evaluates re-running migration on fully migrated DB applies zero duplicate indexes and leaves 0 pending. | Migration Integration | PASS |

## 4. File Manifest

### Files Created
- `packages/extension/src/components/status-dashboard.ts`
- `packages/extension/src/api/status-client.ts`
- `packages/extension/src/status/status-controller.ts`
- `packages/extension/src/status/status-view-model.ts`
- `packages/extension/src/popup.css`
- `packages/extension/scripts/build.mjs`
- `packages/shared/src/metrics-schema.ts`
- `packages/shared/src/status-schema-phase8.ts`
- `packages/worker/src/http/metrics-routes.ts`
- `packages/worker/src/http/status-routes.ts`
- `packages/worker/src/metrics/metrics-read-service.ts`
- `packages/worker/src/metrics/metrics-repository.ts`
- `packages/worker/src/metrics/metrics-types.ts`
- `packages/worker/src/status/status-config.ts`
- `packages/worker/src/status/status-errors.ts`
- `packages/worker/src/status/status-factory.ts`
- `packages/worker/src/status/status-read-service.ts`
- `packages/worker/src/status/status-repository.ts`
- `packages/worker/src/status/status-types.ts`
- `packages/worker/tests/db/0007-migration.test.ts`
- `packages/worker/tests/metrics/metrics-query-bounds.test.ts`
- `packages/worker/tests/metrics/metrics-read-service.test.ts`
- `packages/worker/tests/metrics/metrics-routes.test.ts`
- `packages/worker/tests/metrics/metrics-security.test.ts`
- `packages/worker/tests/security/dash-sec-canonical.test.ts`
- `packages/worker/tests/security/dash-boundary-canonical.test.ts`
- `packages/worker/tests/status/status-boundary.test.ts`
- `packages/worker/tests/status/status-read-service.test.ts`
- `packages/worker/tests/status/status-routes.test.ts`
- `packages/worker/tests/status/status-security.test.ts`
- `packages/shared/tests/metrics-schema.test.ts`
- `packages/shared/tests/status-schema-phase8.test.ts`
- `packages/extension/tests/status-client.test.ts`
- `packages/extension/tests/status-view-model.test.ts`
- `packages/extension/tests/status-dashboard.test.ts`
- `phase-8-report.md`

### Files Modified
- `packages/extension/src/popup.ts`
- `packages/extension/src/popup.html`
- `packages/extension/package.json`
- `packages/shared/src/index.ts`
- `packages/worker/src/index.ts`
- `packages/worker/src/db/migrations/0007_dashboard_metrics_indexes.sql`
- `packages/worker/src/db/migrations.ts`
- `README.md`
- `docs/roadmap.md`
- `docs/architecture.md`
- `docs/domain-model.md`
- `docs/database-schema.md`
- `docs/event-model.md`
- `docs/api-contracts.md`
- `docs/testing-strategy.md`
- `docs/risk-register.md`
- `docs/phases/phase-8-dashboard-metrics.md`

### Files Intentionally Unchanged
- `packages/worker/src/orchestration/*`
- `packages/worker/src/delivery/*`
- `packages/worker/src/subscriptions/*`
- `packages/worker/src/source/*`
- All other non-Phase 8 core worker and extension files.

## 5. Public Status Contract

- **fresh**: latest persisted evidence trusted and checked within 600 seconds, independent of resetAnnounced.
- **stale**: latest trusted evidence has a valid checked_at older than 600 seconds.
- **unavailable**: latest evidence unavailable/untrusted, or checked_at invalid/future. May include explicitly labeled last-known trusted probability.
- **empty**: no persisted snapshot evidence exists.
- **previous probability**: only controls last-known display.
- **probability 100**: does not imply announced.

## 6. Metrics Semantics

**Window-bounded**
orchestration:
- total
- completed
- completedWithErrors
- failed
- skippedOverlap

events:
- probabilityReached70
- resetAnnounced

**Current global state**
deliveries:
- pending
- duePending
- processing
- staleProcessing
- sentToProvider
- failedPermanent
- cancelled

**Latest global**
- orchestration.latestStatus
- orchestration.latestFinishedAt
- source.latestOutcome
- source.latestHealth
- source.latestCheckedAt
- source.latestTrustedObservedAt

## 7. MIG-DASH Query-Plan Evidence

To ensure production stability, partial indexes correctly avoid full table scans.

### Target Query 1 (Processing Started)
```sql
EXPLAIN QUERY PLAN SELECT COUNT(*) as c FROM notification_deliveries 
WHERE state = 'processing' 
  AND processing_started_at < ?
```
**Assertion:** The query engine explicitly uses `idx_deliveries_processing_started`, proving we avoid full table scans for deliveries matching the metric criteria.

### Target Query 2 (Event Types)
```sql
EXPLAIN QUERY PLAN SELECT type, COUNT(*) as c FROM reset_events 
WHERE type IN ('PROBABILITY_REACHED_70', 'RESET_ANNOUNCED')
  AND created_at > ?
GROUP BY type
```
**Assertion:** The query engine explicitly uses `idx_reset_events_type_created`, proving we avoid full table scans for event queries.

### Target Query 3 (Orchestration Runs)
```sql
EXPLAIN QUERY PLAN SELECT status, COUNT(*) as c FROM orchestration_runs 
WHERE started_at > ?
GROUP BY status
```
**Assertion:** The query engine explicitly uses `idx_orch_runs_started_status`, proving we avoid full table scans.

## 8. Documentation Updates Confirmed

- `README.md`
- `docs/architecture.md`
- `docs/domain-model.md`
- `docs/database-schema.md`
- `docs/event-model.md`
- `docs/api-contracts.md`
- `docs/testing-strategy.md`
- `docs/risk-register.md`
- `docs/roadmap.md`
- `docs/phases/phase-8-dashboard-metrics.md`

## 9. Status
IMPLEMENTED — PENDING REVIEW

PHASE 8 COMPLETE — READY FOR REVIEW
