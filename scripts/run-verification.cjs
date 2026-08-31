/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(baseDir, 'artifacts');

if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

function runCommand(command, env = process.env) {
  try {
    console.log(`Running: ${command}`);
    execSync(command, { stdio: 'inherit', cwd: baseDir, env });
    return 0;
  } catch (e) {
    return e.status || 1;
  }
}

const runId = 'run-' + Date.now();
const startedAt = new Date().toISOString();

// 1. Verify a9c8b08
let headCommit = '';
try {
  headCommit = execSync('git rev-parse HEAD', { cwd: baseDir, encoding: 'utf8' }).trim();
  execSync('git merge-base --is-ancestor a9c8b08 HEAD', { cwd: baseDir });
} catch (e) {
  console.error('Commit a9c8b08 is not an ancestor of HEAD or does not exist.', e);
  process.exit(1);
}

try {
  const oldReport = execSync('git show a9c8b08:phase-8-report.md', {
    cwd: baseDir,
    encoding: 'utf8',
  });
  if (!oldReport.includes('656')) {
    console.error('Commit a9c8b08 phase-8-report.md does not contain the 656-test baseline.');
    process.exit(1);
  }
} catch (e) {
  console.error('Could not verify phase-8-report.md in a9c8b08.', e);
  process.exit(1);
}

// 2. Remove old verification JSON files
const jsonPaths = [
  'packages/shared/verification-results.json',
  'packages/extension/verification-results.json',
  'packages/worker/verification-results.json',
];

for (const p of jsonPaths) {
  const fullPath = path.join(baseDir, p);
  if (fs.existsSync(fullPath)) {
    console.log(`Removing old JSON: ${p}`);
    fs.unlinkSync(fullPath);
  }
}

// 3. Resolve Dependency Status
let dependencyGraphChanged = false;
let packageMetadataChanged = false;

try {
  const diffOutput = execSync('git diff --name-only a9c8b08', {
    cwd: baseDir,
    encoding: 'utf8',
  }).trim();
  const diffLines = diffOutput.split('\n').filter(Boolean);

  if (diffLines.some((l) => l.includes('package.json') || l.includes('package-lock.json'))) {
    packageMetadataChanged = true;
  }

  if (packageMetadataChanged) {
    const patchOutput = execSync(
      'git diff a9c8b08 package.json package-lock.json packages/*/package.json',
      { cwd: baseDir, encoding: 'utf8' }
    );
    if (
      patchOutput.includes('+  "dependencies"') ||
      patchOutput.includes('+  "devDependencies"') ||
      patchOutput.includes('package-lock.json') ||
      diffLines.includes('package-lock.json') ||
      patchOutput.includes('-  "dependencies"') ||
      patchOutput.includes('-  "devDependencies"')
    ) {
      dependencyGraphChanged = true;
    }
  }
} catch (e) {
  console.error('Error checking git diff', e);
}

let npmCiExitCode = null;
if (dependencyGraphChanged) {
  console.log('Dependency graph changed. Running npm ci...');
  npmCiExitCode = runCommand('npm ci');
  if (npmCiExitCode !== 0) {
    console.log('npm ci hit file lock on Windows, falling back to npm install...');
    npmCiExitCode = runCommand('npm install');
  }
  if (npmCiExitCode !== 0) {
    console.error('npm install failed');
    process.exit(npmCiExitCode);
  }
}

const depStatus = {
  runId,
  headCommit,
  packageMetadataChanged: packageMetadataChanged ? 'YES' : 'NO',
  dependencyGraphChanged: dependencyGraphChanged ? 'YES' : 'NO',
  npmCiRequired: dependencyGraphChanged ? 'YES' : 'NO',
  npmCiExitCode,
};
fs.writeFileSync(
  path.join(artifactsDir, 'dependency-status.json'),
  JSON.stringify(depStatus, null, 2) + '\n'
);

// 4. Verify
const { validateWorkspaceExecution } = require('./verification-validator.cjs');

const workspaces = ['packages/shared', 'packages/worker', 'packages/extension'];
for (const ws of workspaces) {
  const jsonPath = path.join(baseDir, ws, 'verification-results.json');
  if (fs.existsSync(jsonPath)) {
    fs.unlinkSync(jsonPath);
  }
}

const commands = [
  'npm run format:check',
  'npm run lint',
  'npm run typecheck',
  'npm run build',
  'npm audit --audit-level=moderate',
];

const commandResults = { runId, headCommit, results: {} };

for (const cmd of commands) {
  const code = runCommand(cmd);
  commandResults.results[cmd] = code;
  if (code !== 0) {
    console.error(`${cmd} failed with exit code ${code}`);
    fs.writeFileSync(
      path.join(artifactsDir, 'command-results.json'),
      JSON.stringify(commandResults, null, 2) + '\n'
    );
    process.exit(code);
  }
}

for (const ws of workspaces) {
  console.log(`Running tests for ${ws}...`);
  const wsPath = path.join(baseDir, ws);
  const jsonPath = path.join(wsPath, 'verification-results.json');
  const testStart = Date.now();
  let exitCode = 0;
  let stdout = '';
  let stderr = '';

  try {
    const out = execSync(
      `npx vitest run --reporter default --reporter json --outputFile verification-results.json`,
      {
        cwd: wsPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    stdout = out;
  } catch (e) {
    exitCode = e.status || 1;
    stdout = e.stdout || '';
    stderr = e.stderr || '';
  }

  const valResult = validateWorkspaceExecution({
    exitCode,
    jsonPath,
    startedAt: testStart,
    stdout,
    stderr,
  });

  if (!valResult.valid) {
    console.error(`[FAILURE] Workspace ${ws} failed verification: ${valResult.reason}`);
    commandResults.results[`test:${ws}`] = {
      command: `npx vitest run --reporter default --reporter json --outputFile verification-results.json (cwd: ${ws})`,
      exitCode,
      numPassedTests: 0,
      numFailedTests: 1,
      unexpectedShutdown:
        stdout.includes('Worker exited unexpectedly') ||
        stderr.includes('Worker exited unexpectedly'),
      unhandledErrors: 1,
    };
    fs.writeFileSync(
      path.join(artifactsDir, 'command-results.json'),
      JSON.stringify(commandResults, null, 2) + '\n'
    );
    process.exit(exitCode || 1);
  }

  console.log(`[PASS] Workspace ${ws} passed verification with ${valResult.numPassedTests} tests.`);
  commandResults.results[`test:${ws}`] = {
    command: `npx vitest run --reporter default --reporter json --outputFile verification-results.json (cwd: ${ws})`,
    exitCode: 0,
    numPassedTests: valResult.numPassedTests,
    numFailedTests: 0,
    unexpectedShutdown: false,
    unhandledErrors: 0,
  };
}

// 5. Build and validate a deterministic verification package. This proves the release
// pipeline without claiming that the example Worker origin is a production deployment.
const verificationApiOrigin = 'https://codex-reset-notifier.example.workers.dev';
const packageExitCode = runCommand('npm run package:extension', {
  ...process.env,
  WORKER_API_BASE_URL: verificationApiOrigin,
});
commandResults.results['npm run package:extension'] = packageExitCode;
if (packageExitCode !== 0) {
  console.error(`npm run package:extension failed with exit code ${packageExitCode}`);
  fs.writeFileSync(
    path.join(artifactsDir, 'command-results.json'),
    JSON.stringify(commandResults, null, 2) + '\n'
  );
  process.exit(packageExitCode);
}

const extensionArchivePath = path.join(baseDir, 'extension-release.zip');
const extensionChecksumPath = `${extensionArchivePath}.sha256`;
if (!fs.existsSync(extensionArchivePath) || !fs.existsSync(extensionChecksumPath)) {
  console.error('Extension package or checksum file is missing.');
  process.exit(1);
}
const extensionHash = require('crypto')
  .createHash('sha256')
  .update(fs.readFileSync(extensionArchivePath))
  .digest('hex');
const expectedChecksum = `${extensionHash}  extension-release.zip`;
if (fs.readFileSync(extensionChecksumPath, 'utf8').trim() !== expectedChecksum) {
  console.error('Extension package checksum file does not match the archive.');
  process.exit(1);
}
fs.writeFileSync(
  path.join(artifactsDir, 'extension-package.json'),
  JSON.stringify(
    {
      runId,
      headCommit,
      generatedAt: new Date().toISOString(),
      apiOrigin: verificationApiOrigin,
      archive: 'extension-release.zip',
      sha256: extensionHash,
      checksumVerified: true,
      releaseReady: false,
      note: 'Verification package only; rebuild with the deployed production Worker origin.',
    },
    null,
    2
  ) + '\n'
);

fs.writeFileSync(
  path.join(artifactsDir, 'command-results.json'),
  JSON.stringify(commandResults, null, 2) + '\n'
);

// 6. Preflight
console.log('Running release:preflight:staging');
let preflightExitCode = 0;
let preflightDiagnostics = '';
try {
  const out = execSync('npm run release:preflight:staging', {
    cwd: baseDir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  preflightDiagnostics = out;
} catch (e) {
  preflightExitCode = e.status || 1;
  preflightDiagnostics = (e.stdout || '') + '\n' + (e.stderr || '');
}

preflightDiagnostics = preflightDiagnostics.replace(/\r/g, '').trim();

const preflightResult = {
  runId,
  headCommit,
  command: 'npm run release:preflight:staging',
  exitCode: preflightExitCode,
  classification:
    preflightExitCode === 2
      ? 'EXPECTED_CONFIGURATION_INCOMPLETE'
      : preflightExitCode === 0
        ? 'SUCCESS'
        : 'UNKNOWN_ERROR',
  diagnostics: preflightDiagnostics,
  mutationsPerformed: false,
};

fs.writeFileSync(
  path.join(artifactsDir, 'staging-preflight-result.json'),
  JSON.stringify(preflightResult, null, 2) + '\n'
);

const verificationRun = {
  runId,
  headCommit,
  startedAt,
  completedAt: new Date().toISOString(),
};

fs.writeFileSync(
  path.join(artifactsDir, 'verification-run.json'),
  JSON.stringify(verificationRun, null, 2) + '\n'
);

// 7. Generate Report
console.log('Generating report...');
const reportCode = runCommand('node scripts/generate-release-report.cjs');
if (reportCode !== 0) {
  console.error(`generate-release-report.cjs failed with exit code ${reportCode}`);
  process.exit(reportCode);
}

// Local verification requires a complete staging configuration. Live Gate B evidence is
// evaluated separately because it requires external connectivity and an admin bearer token.
if (preflightResult.classification === 'SUCCESS') {
  console.log('Verification Sequence Complete. Local checks and staging preflight passed.');
  process.exit(0);
} else if (preflightResult.classification === 'EXPECTED_CONFIGURATION_INCOMPLETE') {
  // Staging configuration remains incomplete, so Gate B cannot be signed off.
  console.error(
    'Preflight returned EXPECTED_CONFIGURATION_INCOMPLETE (exit 2). ' +
      'Staging must be fully configured before Gate B completes.'
  );
  process.exit(1);
} else {
  console.error(
    `Preflight failed unexpectedly (exit ${preflightExitCode}): ${preflightDiagnostics}`
  );
  process.exit(1);
}
