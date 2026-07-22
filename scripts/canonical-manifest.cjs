/* eslint-disable */
module.exports = {
  canonicalRequirements: {
    // REL-CONFIG
    'REL-CONFIG-1': 'Production wrangler.toml uses explicit codex-reset-notifier worker name.',
    'REL-CONFIG-2': 'Production wrangler.toml contains no wildcard or localhost ALLOWED_ORIGINS.',
    'REL-CONFIG-3': 'Production wrangler.toml prevents accidental development fallback.',
    // REL-SECRET
    'REL-SECRET-1': 'Secrets documentation specifies bindings without revealing real values.',
    // REL-D1
    'REL-D1-1': 'Staging D1 database binding differs from production D1 database binding.',
    // REL-CORS
    'REL-CORS-1': 'Production worker rejects forbidden Origin before database queries.',
    // REL-STAGING-CONTRACT
    'REL-STAGING-CONTRACT-1': 'Staging GET /api/status returns valid schema and CORS.',
    'REL-STAGING-CONTRACT-2': 'Staging OPTIONS /api/status returns 204 with CORS headers.',
    'REL-STAGING-CONTRACT-3': 'Staging GET /api/admin/metrics rejects unauthorized bearer token.',
    // REL-PREFLIGHT
    'REL-PREFLIGHT-1': 'Staging Worker name differs from production.',
    'REL-PREFLIGHT-2': 'Configured staging and production D1 IDs differ when non-placeholder.',
    'REL-PREFLIGHT-3': 'Empty staging D1 ID is rejected.',
    'REL-PREFLIGHT-4': 'Staging D1 placeholder is rejected by deployment preflight.',
    'REL-PREFLIGHT-5': 'Production extension ID placeholder blocks production release validation.',
    'REL-PREFLIGHT-6': 'Staging extension ID placeholder blocks staging preflight.',
    'REL-PREFLIGHT-7': 'Production config has no staging Worker/D1 reference.',
    'REL-PREFLIGHT-8': 'Development config has no production Worker/D1 reference.',
    // REL-PACKAGE
    'REL-PACKAGE-1': 'Production ZIP excludes tests, source maps, and development files.',
    'REL-PACKAGE-2': 'Production packaging produces a validated ZIP and SHA-256 checksum.',
    // REL-BOUNDARY
    'REL-BOUNDARY-1': 'Extension ZIP contains no upstream source URL.',
    'REL-BOUNDARY-2': 'Extension ZIP contains no localhost.',
    'REL-BOUNDARY-3': 'Production ZIP contains no staging Worker URL.',
    'REL-BOUNDARY-4': 'Extension requests only configured Worker.',
    'REL-BOUNDARY-5': 'Status and metrics routes remain read-only.',
    'REL-BOUNDARY-6': 'CORS cannot authorize admin metrics.',
    'REL-BOUNDARY-7': 'No provider webhook is introduced.',
    'REL-BOUNDARY-8': 'No Cloudflare Queue is introduced.',
    'REL-BOUNDARY-9': 'No probability90 behavior exists.',
    'REL-BOUNDARY-10': 'No RESET_COMPLETED subscriber notification exists.',
    'REL-BOUNDARY-11': 'Deployment scripts do not default to production.',
    'REL-BOUNDARY-12': 'Production deployment requires explicit confirmation.',
    'REL-BOUNDARY-13': 'Chrome Web Store submission cannot run automatically.',
    'REL-BOUNDARY-14': 'No Phase 10 functionality is introduced.',
    // REL-EMAIL
    'REL-EMAIL-1': 'Staging email provider operates in safe/sandbox mode preventing real sends.',
    // REL-SEC
    'REL-SEC-1': 'Secret scan detects no real committed credentials in repository.',
    'REL-SEC-2': 'Extension package contains no secrets or admin tokens.',
    'REL-SEC-3': 'Logger sentinel test proves admin and provider tokens occur zero times in logs.',
    // REL-MON
    'REL-MON-1': 'Monitoring runbook documents worker request failure threshold.',
    // REL-RUNBOOK
    'REL-RUNBOOK-1': 'Rollback runbook documents D1 schema drop risks and forward fixes.',
  },
  exactSummaries: {
    // Config
    'REL-CONFIG-1':
      'Reads wrangler.toml, parses production env, asserts name strictly equals codex-reset-notifier.',
    'REL-CONFIG-2':
      'Reads wrangler.toml, parses production env, asserts ALLOWED_ORIGINS excludes * and localhost.',
    'REL-CONFIG-3':
      'Reads wrangler.toml, asserts top-level env is strictly development to prevent prod fallback.',
    // Secret
    'REL-SECRET-1':
      'Reads docs/runbooks/secrets-management.md, asserts bindings are listed without exposing test-admin-secret.',
    // D1
    'REL-D1-1':
      'Reads wrangler.toml, asserts staging database_id is strictly distinct from production database_id.',
    // CORS
    'REL-CORS-1':
      'Mocks request with forbidden Origin, asserts 403 returned before any D1 query executes.',
    // Staging Contract
    'REL-STAGING-CONTRACT-1':
      'Fetches local /api/status handler, asserts HTTP 200, schemaVersion 1, and valid CORS headers.',
    'REL-STAGING-CONTRACT-2':
      'Fetches local OPTIONS /api/status handler, asserts HTTP 204 with valid CORS headers.',
    'REL-STAGING-CONTRACT-3':
      'Fetches local /api/admin/metrics handler with invalid token, asserts HTTP 401.',
    // Preflight
    'REL-PREFLIGHT-1':
      'Parses worker name from wrangler.toml, asserts staging worker differs from production.',
    'REL-PREFLIGHT-2':
      'Parses database_id from wrangler.toml, asserts staging differs from production.',
    'REL-PREFLIGHT-3': 'Asserts empty database_id is strictly rejected.',
    'REL-PREFLIGHT-4':
      'Executes staging preflight CLI against placeholder config, asserts Code 2 EXPECTED CONFIGURATION INCOMPLETE.',
    'REL-PREFLIGHT-5':
      'Executes production preflight CLI against placeholder extension ID, asserts Code 2.',
    'REL-PREFLIGHT-6':
      'Executes staging preflight CLI against placeholder extension ID, asserts Code 2.',
    'REL-PREFLIGHT-7': 'Asserts production wrangler block has zero staging Worker/D1 references.',
    'REL-PREFLIGHT-8': 'Asserts development config has zero production references.',
    // Package
    'REL-PACKAGE-1':
      'Inspects extension zip contents, asserts 0 occurrences of .test.ts or .map files.',
    'REL-PACKAGE-2':
      'Executes build pipeline, asserts extension.zip output and valid SHA-256 generation.',
    // Boundary
    'REL-BOUNDARY-1': 'Reads extension source, asserts no external source URL.',
    'REL-BOUNDARY-2': 'Reads extension source, asserts no localhost references.',
    'REL-BOUNDARY-3': 'Reads production bundle, asserts no staging worker URL.',
    'REL-BOUNDARY-4':
      'Asserts extension requests only explicitly configured production Worker URL.',
    'REL-BOUNDARY-5':
      'Analyzes handler execution for status and metrics routes, asserts zero mutating operations.',
    'REL-BOUNDARY-6':
      'Validates CORS preflight and allowed Origin on metrics endpoint rejects without valid bearer token.',
    'REL-BOUNDARY-7': 'Asserts zero provider webhooks configured or imported.',
    'REL-BOUNDARY-8': 'Asserts zero Cloudflare Queue consumers defined in wrangler.toml.',
    'REL-BOUNDARY-9': 'Asserts zero references to probability90 in source logic.',
    'REL-BOUNDARY-10': 'Asserts zero subscriber notifications implemented for RESET_COMPLETED.',
    'REL-BOUNDARY-11':
      'Executes deployment preflight without env flag, asserts missing env fails (no prod default).',
    'REL-BOUNDARY-12':
      'Executes production deployment preflight, asserts explicit confirmation flag required.',
    'REL-BOUNDARY-13': 'Asserts zero automated Web Store submission scripts exist.',
    'REL-BOUNDARY-14': 'Asserts zero functionality for Phase 10 exists.',
    // Email
    'REL-EMAIL-1':
      'Instantiates staging email provider, asserts rejection of send and safe sandbox mode.',
    // Security
    'REL-SEC-1':
      'Scans repository for committed credentials, asserts zero occurrences of test-admin-secret.',
    'REL-SEC-2': 'Scans extension package, asserts zero admin API tokens or secrets included.',
    'REL-SEC-3': 'Analyzes worker logs, asserts zero occurrences of admin tokens or provider keys.',
    // Monitoring
    'REL-MON-1': 'Reads docs/runbooks/monitoring-runbook.md, asserts failure threshold documented.',
    // Runbook
    'REL-RUNBOOK-1':
      'Reads docs/runbooks/rollback-runbook.md, asserts D1 schema drop risks documented.',
  },
};
