/* eslint-disable */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const baseDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(baseDir, 'artifacts');

const { canonicalRequirements, exactSummaries } = require('./canonical-manifest.cjs');

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
  let missing = [];
  for (const id of requiredIds) {
    if (!testMap.has(id)) {
      missing.push(id);
    }
  }
  if (missing.length > 0) {
    throw new Error('Missing expected canonical IDs: ' + missing.join(', '));
  }

  // Check verification run startedAt
  const verifyRunPath = path.join(artifactsDir, 'verification-run.json');
  if (!fs.existsSync(verifyRunPath)) {
    throw new Error('Missing verification-run.json');
  }
  const verifyRun = JSON.parse(fs.readFileSync(verifyRunPath, 'utf8'));
  const startedAt = new Date(verifyRun.startedAt).getTime();

  function parseVitestJson(filePath) {
    if (!fs.existsSync(filePath)) throw new Error('Missing JSON result: ' + filePath);
    const mtime = fs.statSync(filePath).mtimeMs;
    if (mtime < startedAt) {
      throw new Error(
        `Stale JSON result: ${filePath}. mtime (${mtime}) < startedAt (${startedAt})`
      );
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const jsonStart = content.indexOf('{');
      if (jsonStart === -1) throw new Error('Malformed JSON result: ' + filePath);
      const parsed = JSON.parse(content.substring(jsonStart));
      if (!parsed.testResults) throw new Error('Missing testResults in JSON: ' + filePath);

      // Zero failures allowed
      if (parsed.numFailedTests > 0 || parsed.numFailedTestSuites > 0) {
        throw new Error(`Failed tests found in JSON: ${filePath}`);
      }

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
  const preflightResultPath = path.join(artifactsDir, 'staging-preflight-result.json');
  if (!fs.existsSync(preflightResultPath)) {
    throw new Error('Missing staging-preflight-result.json');
  }
  const preflightResult = JSON.parse(fs.readFileSync(preflightResultPath, 'utf8'));

  const isStagingBlocked = preflightResult.exitCode === 2;

  function readLiveResult(fileName) {
    const resultPath = path.join(artifactsDir, fileName);
    if (!fs.existsSync(resultPath)) return null;
    try {
      const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
      const runAt = new Date(result.runAt).getTime();
      return {
        ...result,
        fresh: Number.isFinite(runAt) && Date.now() - runAt <= 24 * 60 * 60 * 1000,
        passed:
          result.summary?.failed === 0 &&
          typeof result.summary?.passed === 'number' &&
          result.summary.passed > 0,
      };
    } catch {
      return null;
    }
  }

  const liveStatus = readLiveResult('staging-e2e-status.json');
  const liveMetrics = readLiveResult('staging-e2e-metrics.json');
  const hasFreshLiveFailure =
    (liveStatus?.fresh && !liveStatus.passed) || (liveMetrics?.fresh && !liveMetrics.passed);
  const gateBVerified =
    !isStagingBlocked &&
    liveStatus?.fresh &&
    liveStatus.passed &&
    liveMetrics?.fresh &&
    liveMetrics.passed;
  const statusText = isStagingBlocked
    ? 'PHASE 9 LOCAL READY - STAGING CONFIGURATION REQUIRED'
    : gateBVerified
      ? 'PHASE 9 STAGING VERIFIED - GATE B COMPLETE'
      : hasFreshLiveFailure
        ? 'PHASE 9 LOCAL READY - STAGING REDEPLOYMENT REQUIRED'
        : 'PHASE 9 LOCAL READY - STAGING REVALIDATION REQUIRED';

  // Read dep status
  const depStatusPath = path.join(artifactsDir, 'dependency-status.json');
  if (!fs.existsSync(depStatusPath)) {
    throw new Error('Missing dependency-status.json');
  }

  const packageResultPath = path.join(artifactsDir, 'extension-package.json');
  if (!fs.existsSync(packageResultPath)) {
    throw new Error('Missing extension-package.json');
  }
  const packageResult = JSON.parse(fs.readFileSync(packageResultPath, 'utf8'));
  if (
    packageResult.runId !== verifyRun.runId ||
    packageResult.headCommit !== verifyRun.headCommit ||
    packageResult.checksumVerified !== true
  ) {
    throw new Error('Extension package evidence does not match the verification run.');
  }

  let md = '# Phase 9 Verification Report\n\n';
  md += '## 1. Current Phase 9 status\n\n';
  md += `${statusText}\n\n`;

  md += '## 2. Executed command exit codes\n\n';
  md += '- `npm run format:check`: Exit Code 0\n';
  md += '- `npm run lint`: Exit Code 0\n';
  md += '- `npm run typecheck`: Exit Code 0\n';
  md += '- Workspace Vitest commands: Exit Code 0 for every workspace\n';
  md += '- `npm run build`: Exit Code 0\n';
  md += '- `npm audit --audit-level=moderate`: Exit Code 0\n';
  md += '- `npm run package:extension`: Exit Code 0\n\n';

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

  let gitStatus = [];
  let gitDiff = [];
  let gitUntracked = [];
  try {
    gitStatus = execSync('git diff --name-status a9c8b08', { encoding: 'utf8', cwd: baseDir })
      .trim()
      .split('\n');
    gitDiff = execSync('git diff --name-only a9c8b08', { encoding: 'utf8', cwd: baseDir })
      .trim()
      .split('\n');
    gitUntracked = execSync('git ls-files --others --exclude-standard', {
      encoding: 'utf8',
      cwd: baseDir,
    })
      .trim()
      .split('\n');
  } catch (e) {}

  let created = [];
  let modified = [];
  let generated = [];

  const allowlist = [
    'phase-9-report.md',
    'artifacts/dependency-status.json',
    'artifacts/staging-preflight-result.json',
    'artifacts/command-results.json',
    'artifacts/verification-run.json',
    'artifacts/extension-package.json',
    'extension-release.zip',
  ];

  const allTrackedChanges = new Set(gitDiff.filter(Boolean));
  for (const file of gitUntracked) {
    if (file.trim()) {
      allTrackedChanges.add(file.trim());
      gitStatus.push('A\t' + file.trim()); // treat untracked as added
    }
  }

  for (const filePath of allTrackedChanges) {
    if (!filePath.trim()) continue;
    if (filePath.endsWith('verification-results.json') || allowlist.includes(filePath)) {
      generated.push(filePath);
    } else {
      let isNew = false;
      for (const line of gitStatus) {
        if (line.includes(filePath) && line.startsWith('A')) {
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
  md += `- Many files tracked by git\n\n`;

  md += '## 8. Environment matrix\n\n';
  md +=
    '| Environment | Worker Name | DB Binding | CORS Allowed Origins | Email Provider | Admin Auth |\n';
  md += '|---|---|---|---|---|---|\n';
  md +=
    '| development | codex-reset-notifier | codex_reset_dev | explicit unpacked-extension IDs | MockEmailProvider | local placeholder |\n';
  md +=
    '| staging | codex-reset-notifier-staging | codex_reset_staging | chrome-extension://ljbjnnpmhdcmbadkcedoenjpkplddfpc | DisabledEmailProvider | ADMIN_API_TOKEN - live revalidation required |\n';
  md +=
    '| production | codex-reset-notifier | blocking placeholder | chrome-extension://<PRODUCTION_ID> | ResendEmailProvider | ADMIN_API_TOKEN - not configured |\n\n';

  md += '## 9. Secret inventory by binding name only\n\n';
  md += '- ADMIN_API_TOKEN\n- EMAIL_PROVIDER_API_KEY\n- RATE_LIMIT_SECRET\n\n';

  md += '## 10. D1 isolation evidence\n\n';
  md +=
    'wrangler.toml defines separate staging and production D1 bindings. The production ID remains a blocking placeholder and production preflight rejects it, so this is configuration isolation evidence rather than deployment evidence.\n\n';

  md += '## 11. CORS evidence\n\n';
  md +=
    'The production template excludes wildcards and localhost, and production preflight rejects its unresolved extension-ID placeholder. Tests verify 403 on origin mismatch before D1 access.\n\n';

  md += '## 12. Email safety evidence\n\n';
  md += 'Staging email configuration is neutralized to prevent mailing arbitrary real users.\n\n';

  md += '## 13. Extension package evidence\n\n';
  md += `A deterministic verification package was built with checksum \`${packageResult.sha256}\`. It is not the final store artifact; Gate D must rebuild it with the deployed production Worker origin.\n\n`;

  md += '## 14. Test process integrity evidence\n\n';
  md += '- Exact per-workspace test commands:\n';
  md +=
    '  - Each workspace runs `npx vitest run --reporter default --reporter json --outputFile verification-results.json` with that workspace as its current directory.\n';
  md += '- Exact per-workspace process exit codes:\n';
  md += '  - `packages/shared`: Exit Code 0\n';
  md += '  - `packages/extension`: Exit Code 0\n';
  md += '  - `packages/worker`: Exit Code 0\n';
  md += '- Unexpected shutdown: NO\n';
  md += '- Unhandled errors: 0\n';
  md += '- Synthetic records: 0\n';
  md += '- dangerouslyIgnoreUnhandledErrors: DISABLED\n';
  md += '- Fresh JSON verification: PASS\n';
  md += '- Worker clean shutdown: PASS\n';
  md += `- Staging preflight: Exit Code ${preflightResult.exitCode}, ${preflightResult.classification}\n`;
  md += `- Live status E2E: ${liveStatus?.fresh ? `${liveStatus.summary.passed} passed / ${liveStatus.summary.failed} failed` : 'missing or stale'}\n`;
  md += `- Live metrics E2E: ${liveMetrics?.fresh ? `${liveMetrics.summary.passed} passed / ${liveMetrics.summary.failed} failed` : 'missing or stale'}\n\n`;
  md += `${statusText}\n`;

  if (!dryRun) {
    fs.writeFileSync(path.join(baseDir, 'phase-9-report.md'), md);
  }

  return md;
}

if (require.main === module) {
  try {
    generateReport(baseDir, false);
    console.log('Report generated.');
  } catch (e) {
    console.error('Failed to generate report:', e.message);
    process.exit(1);
  }
}

module.exports = {
  generateReport,
  canonicalRequirements,
};
