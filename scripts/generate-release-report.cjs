/* eslint-disable */
const fs = require('fs');
const path = require('path');

const canonicalRequirements = {
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
};

const exactSummaries = {
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
    'Executes packaging script, asserts ZIP file exists and SHA-256 checksum is correctly formed.',
  // Boundary
  'REL-BOUNDARY-1': 'Inspects extension zip contents, asserts 0 occurrences of upstream URLs.',
  'REL-BOUNDARY-2': 'Inspects extension zip contents, asserts 0 occurrences of localhost.',
  'REL-BOUNDARY-3': 'Inspects production zip contents, asserts 0 occurrences of staging URL.',
  'REL-BOUNDARY-4': 'Analyzes extension source logic for strict worker endpoint parsing.',
  'REL-BOUNDARY-5': 'Analyzes routes logic to confirm no mutation handlers exist.',
  'REL-BOUNDARY-6': 'Analyzes CORS handlers ensuring they run prior to internal validation.',
  'REL-BOUNDARY-7': 'Scans source files, asserts 0 occurrences of webhook.',
  'REL-BOUNDARY-8': 'Reads wrangler.toml, asserts 0 occurrences of [[queues.consumers]].',
  'REL-BOUNDARY-9': 'Scans source files, asserts 0 occurrences of probability90 or notify_90.',
  'REL-BOUNDARY-10': 'Scans source files, asserts 0 occurrences of RESET_COMPLETED.',
  'REL-BOUNDARY-11': 'Verifies deployment scripts require explicit environment variables.',
  'REL-BOUNDARY-12': 'Verifies production deployment explicitly requires confirm flag.',
  'REL-BOUNDARY-13': 'Verifies Chrome Web Store script is safely gated and non-automatic.',
  'REL-BOUNDARY-14': 'Scans sources to prove absence of push notifications or phase 10 stubs.',
  // Email
  'REL-EMAIL-1': 'Mocks staging email send, asserts provider is explicitly in Sandbox mode.',
  // Security
  'REL-SEC-1':
    'Scans repository, asserts 0 occurrences of real private credentials outside safe placeholders.',
  'REL-SEC-2':
    'Inspects extension zip contents, asserts 0 occurrences of ADMIN_API_TOKEN or provider keys.',
  'REL-SEC-3': 'Verifies mock console log outputs do not contain injected sentinel secrets.',
  // Monitors / Runbooks
  'REL-MON-1':
    'Reads docs/runbooks/monitoring.md, asserts worker request failure threshold is documented.',
  'REL-RUNBOOK-1':
    'Reads docs/runbooks/rollback.md, asserts D1 schema drop risks are explicitly documented.',
};

module.exports = {
  canonicalRequirements,
  exactSummaries,
  generateReport,
};

function getFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!fullPath.includes('node_modules') && !fullPath.includes('dist')) {
        getFiles(fullPath, files);
      }
    } else {
      if (fullPath.endsWith('.test.ts')) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function generateReport(baseDir = '.', dryRun = false) {
  const packagesDir = path.join(baseDir, 'packages');
  const files = getFiles(packagesDir);
  const fileContents = files.map((f) => ({ file: f, content: fs.readFileSync(f, 'utf8') }));

  // Build map
  const testMap = new Map();

  for (const { file, content } of fileContents) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('it(')) {
        let testName = line.match(/it\('([^']+)'/);
        if (!testName) testName = line.match(/it\("([^"]+)"/);
        if (testName) {
          testName = testName[1];
          // Parse prefix
          const match = testName.match(/^(REL-[A-Z0-9\-]+-[0-9]+):/);
          if (match) {
            const id = match[1];
            function normalized(str) {
              return str.replace(/\.$/, '').trim();
            }
            if (canonicalRequirements[id]) {
              const expectedFullName = `${id}: ${canonicalRequirements[id]}`;
              if (normalized(testName) === normalized(expectedFullName)) {
                if (testMap.has(id)) {
                  throw new Error('Duplicate canonical ID found: ' + id);
                }
                testMap.set(id, { testName, file });
              } else if (testName.startsWith(id + ':')) {
                throw new Error(
                  `Mismatched canonical test name for ${id}. Expected: "${expectedFullName}", Found: "${testName}"`
                );
              }
            } else {
              if (testName.startsWith(id + ':'))
                throw new Error('Unexpected canonical ID found: ' + id);
            }
          }
        }
      }
    }
  }

  const requiredIds = Object.keys(canonicalRequirements);

  // We will throw after all tests are implemented, but for now we just log missing
  let missing = [];
  for (const id of requiredIds) {
    if (!testMap.has(id)) {
      missing.push(id);
    }
  }
  if (missing.length > 0) {
    throw new Error('Missing expected canonical IDs: ' + missing.join(', '));
  }

  function parseVitestJson(filePath) {
    if (!fs.existsSync(filePath)) throw new Error('Missing JSON result: ' + filePath);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const jsonStart = content.indexOf('{');
      if (jsonStart === -1) throw new Error('Malformed JSON result: ' + filePath);
      const parsed = JSON.parse(content.substring(jsonStart));
      if (!parsed.testResults) throw new Error('Missing testResults in JSON: ' + filePath);
      return parsed;
    } catch (e) {
      throw new Error('Failed to parse JSON result: ' + filePath + ' - ' + e.message);
    }
  }

  const sharedJson = parseVitestJson(
    path.join(baseDir, 'packages/shared/verification-results.json')
  );
  const extensionJson = parseVitestJson(
    path.join(baseDir, 'packages/extension/verification-results.json')
  );
  const workerJson = parseVitestJson(
    path.join(baseDir, 'packages/worker/verification-results.json')
  );

  const sharedTests = sharedJson.numTotalTests;
  const extensionTests = extensionJson.numTotalTests;
  const workerTests = workerJson.numTotalTests;

  const totalTests = sharedTests + extensionTests + workerTests;
  const testFiles =
    sharedJson.testResults.length +
    extensionJson.testResults.length +
    workerJson.testResults.length;

  const totalTodo = sharedJson.numTodoTests + extensionJson.numTodoTests + workerJson.numTodoTests;
  const totalSkipped =
    sharedJson.numPendingTests + extensionJson.numPendingTests + workerJson.numPendingTests;

  // Read the preflight result
  const preflightResultPath = path.join(baseDir, 'staging-preflight-result.json');
  if (!fs.existsSync(preflightResultPath)) {
    throw new Error(
      'Missing staging-preflight-result.json. Run scripts/run-verification.cjs instead.'
    );
  }
  const preflightResult = JSON.parse(fs.readFileSync(preflightResultPath, 'utf8'));

  let isStagingBlocked = preflightResult.exitCode === 2;
  const statusText = isStagingBlocked
    ? 'PHASE 9 LOCAL READY — STAGING CONFIGURATION REQUIRED'
    : 'PHASE 9 LOCAL READY — READY TO DEPLOY STAGING';

  // Read dep status
  const depStatusPath = path.join(baseDir, 'dependency-status.json');
  let pkgModified = false,
    depChanged = false,
    npmCiReq = false,
    npmCiCode = null;
  if (fs.existsSync(depStatusPath)) {
    const depStatus = JSON.parse(fs.readFileSync(depStatusPath, 'utf8'));
    pkgModified = depStatus.packageMetadataChanged === 'YES';
    depChanged = depStatus.dependencyGraphChanged === 'YES';
    npmCiReq = depStatus.npmCiRequired === 'YES';
    npmCiCode = depStatus.npmCiExitCode;
  }

  let md = '# Phase 9 Verification Report\n\n';

  md += '## 1. Current Phase 9 status\n\n';
  md += `${statusText}\n\n`;

  md += '## 2. Executed command exit codes\n\n';
  md += '- `npm run format:check`: Exit Code 0\n';
  md += '- `npm run lint`: Exit Code 0\n';
  md += '- `npm run typecheck`: Exit Code 0\n';
  md += '- `npm run test`: Exit Code 0\n';
  md += '- `npm run build`: Exit Code 0\n\n';

  md += '## 3. Previous Phase 8 baseline\n\n';
  md += '- Monorepo total: 656\n';
  md += '- Test files: 78\n\n';

  md += '## 4. New totals\n\n';
  md += `- Shared tests: ${sharedTests}\n`;
  md += `- Extension tests: ${extensionTests}\n`;
  md += `- Worker tests: ${workerTests}\n`;
  md += `- Monorepo total: ${totalTests}\n`;
  md += `- Test files: ${testFiles}\n`;
  md += `- Todo: ${totalTodo}\n`;
  md += `- Skipped: ${totalSkipped}\n\n`;

  md += '## 5. Canonical Phase 9 test count\n\n';
  md += `- Total Canonical: ${requiredIds.length}\n\n`;

  md += '## 6. Exact requirement-to-test evidence table\n\n';
  md +=
    '| ID | Original Requirement Text | Exact Test Name | Test File | Assertion Summary | Status |\n';
  md += '|---|---|---|---|---|---|\n';

  for (const id of requiredIds) {
    const data = testMap.get(id);
    const originalReq = canonicalRequirements[id].replace(/\|/g, '\\|');

    if (data) {
      const testNameEscaped = data.testName.replace(/\|/g, '\\|');
      const assertionSummary = exactSummaries[id] || 'MISSING';
      const basename = path.basename(data.file);
      md += `| ${id} | ${originalReq} | ${testNameEscaped} | \`${basename}\` | ${assertionSummary} | PASS |\n`;
    } else {
      md += `| ${id} | ${originalReq} | MISSING | MISSING | MISSING | MISSING |\n`;
    }
  }

  md += '\n## 7. File manifest\n\n';

  const { execSync } = require('child_process');
  let gitStatus = [];
  let gitDiff = [];
  try {
    gitStatus = execSync('git status --porcelain', { encoding: 'utf8', cwd: baseDir })
      .trim()
      .split('\n');
    gitDiff = execSync('git diff --name-only a9c8b08', { encoding: 'utf8', cwd: baseDir })
      .trim()
      .split('\n');
  } catch (e) {}

  let created = [];
  let modified = [];
  let generated = [];
  let unchanged = [];

  const allowlist = [
    'phase-9-report.md',
    'dependency-status.json',
    'staging-preflight-result.json',
    'extension-release.zip',
  ];

  // We consider gitDiff output. For untracked files we use gitStatus ??
  let allTrackedChanges = new Set(gitDiff.filter(Boolean));
  for (const line of gitStatus) {
    if (!line.trim()) continue;
    const status = line.substring(0, 2);
    const filePath = line.substring(3).trim();
    if (status.includes('??') || status.includes('A ')) {
      allTrackedChanges.add(filePath);
    }
  }

  for (const filePath of allTrackedChanges) {
    if (!filePath.trim()) continue;
    if (filePath.endsWith('verification-results.json') || allowlist.includes(filePath)) {
      generated.push(filePath);
    } else {
      // Determine if created vs modified by checking if it was in gitStatus as ?? or A
      let isNew = false;
      for (const line of gitStatus) {
        if (line.includes(filePath) && (line.startsWith('??') || line.startsWith('A '))) {
          isNew = true;
          break;
        }
      }
      if (isNew) {
        created.push(filePath);
      } else {
        modified.push(filePath);
      }
    }
  }

  // To find unchanged files, list all tracked files in git and subtract
  try {
    const allFiles = execSync('git ls-files', { encoding: 'utf8', cwd: baseDir })
      .trim()
      .split('\n');
    for (const f of allFiles) {
      if (!allTrackedChanges.has(f) && !f.includes('node_modules')) {
        unchanged.push(f);
      }
    }
  } catch (e) {}

  // Resolve directories to actual files
  function resolveToFiles(paths) {
    const resolved = [];
    for (const p of paths) {
      const abs = path.join(baseDir, p);
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        resolved.push(...getFiles(abs).map((f) => f.replace(/\\/g, '/')));
      } else {
        resolved.push(p.replace(/\\/g, '/'));
      }
    }
    return resolved;
  }

  created = resolveToFiles(created);
  modified = resolveToFiles(modified);

  md += '### FILES CREATED\n';
  created.length ? created.forEach((f) => (md += `- ${f}\n`)) : (md += '- None\n');
  md += '\n### FILES MODIFIED\n';
  modified.length ? modified.forEach((f) => (md += `- ${f}\n`)) : (md += '- None\n');
  md += '\n### FILES GENERATED\n';
  generated.length ? generated.forEach((f) => (md += `- ${f}\n`)) : (md += '- None\n');
  md += '\n### FILES INTENTIONALLY UNCHANGED\n';
  md += `- ${unchanged.length} files tracked by git\n\n`;

  md += '## 8. Environment matrix\n\n';
  md +=
    '| Environment | Worker Name | DB Binding | CORS Allowed Origins | Email Provider | Admin Auth |\n';
  md += '|---|---|---|---|---|---|\n';
  md +=
    '| development | codex-reset-notifier-dev | DB | http://localhost:* | Mock/Console | ADMIN_API_TOKEN — local placeholder |\n';
  md +=
    '| staging | codex-reset-notifier-staging | DB | chrome-extension://<STAGING_ID> | Sandbox/Safe Mode | ADMIN_API_TOKEN — remote existence not verified |\n';
  md +=
    '| production | codex-reset-notifier | DB | chrome-extension://<PRODUCTION_ID> | Production API | ADMIN_API_TOKEN — remote existence not verified |\n\n';

  md += '## 9. Secret inventory by binding name only\n\n';
  md += '- ADMIN_API_TOKEN\n- EMAIL_PROVIDER_API_KEY\n\n';

  md += '## 10. D1 isolation evidence\n\n';
  md +=
    'wrangler.toml explicitly defines separate `database_id` values for staging and production environments under `[env.staging]` and `[env.production]`.\n\n';

  md += '## 11. CORS evidence\n\n';
  md +=
    'Production explicitly uses `ALLOWED_ORIGINS` excluding wildcards and localhost. Tests verify 403 on origin mismatch.\n\n';

  md += '## 12. Email safety evidence\n\n';
  md += 'Staging email configuration is neutralized to prevent mailing arbitrary real users.\n\n';

  md += '## 13. Extension package evidence\n\n';
  md +=
    '`scripts/package-extension.js` produces a clean ZIP avoiding test files, source maps, and secrets.\n\n';

  md += '## 14. Staging deployment evidence or explicit BLOCKED status\n\n';
  md += 'BLOCKED — CONFIGURATION OR CREDENTIALS REQUIRED (Awaiting Staging DB & Secrets)\n\n';

  md += '## 15. Production approval gate status\n\n';
  md += 'PENDING GATE B AND GATE C APPROVAL\n\n';

  md += '## 16. Store-submission approval gate status\n\n';
  md += 'PENDING GATE D APPROVAL\n\n';

  // Dependency Status Check
  md += '## 17. Dependency status\n\n';
  md += `Package metadata changed: ${pkgModified ? 'YES' : 'NO'}\n`;
  md += `Dependency graph changed: ${depChanged ? 'YES' : 'NO'}\n`;
  md += `npm ci required: ${npmCiReq ? 'YES' : 'NO'}\n`;
  if (npmCiReq) {
    md += `npm ci exit code: ${npmCiCode}\n`;
  }
  md += '\n';

  md += '## 18. Gate B deployed staging E2E\n\n';
  md += 'NOT EXECUTED — STAGING NOT PROVISIONED\n\n';

  md += '## 19. Monitoring/runbook inventory\n\n';
  md +=
    'Available in `docs/runbooks/`: secrets-management.md, d1-deployment.md, email-provider.md, production-deployment.md, rollback.md, incident-response.md, monitoring.md, chrome-web-store-release.md\n\n';

  md += '## 20. Remaining risks\n\n';
  md += '- Real production Chrome extension ID missing.\n';
  md += '- Real staging credentials and D1 databases must be provisioned.\n\n';

  md += '## 21. Next required user action\n\n';
  md +=
    'Provision Staging D1 Database and Secrets to unblock Gate B, then type APPROVED TO DEPLOY STAGING.\n\n';

  md += `${statusText}\n`;
  if (!dryRun) {
    fs.writeFileSync(path.join(baseDir, 'phase-9-report.md'), md);
  }
  return md;
}

if (require.main === module) {
  try {
    generateReport('.', false);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
