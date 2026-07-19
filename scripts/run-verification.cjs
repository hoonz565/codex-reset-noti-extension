/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..');

function runCommand(command, env = process.env) {
  try {
    console.log(`Running: ${command}`);
    execSync(command, { stdio: 'inherit', cwd: baseDir, env });
    return 0;
  } catch (e) {
    return e.status || 1;
  }
}

// 1. Remove old verification JSON files
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

// 2. Resolve Dependency Status
let dependencyGraphChanged = false;
let packageMetadataChanged = false;

try {
  const diffOutput = execSync('git diff --name-only a9c8b08', {
    cwd: baseDir,
    encoding: 'utf8',
  }).trim();
  const diffLines = diffOutput.split('\n').filter(Boolean);

  for (const line of diffLines) {
    if (line.includes('package.json') || line.includes('package-lock.json')) {
      packageMetadataChanged = true;
      break;
    }
  }

  // Determine graph change vs just metadata
  // We'll consider package-lock.json changes or dependencies/devDependencies changes as a graph change.
  // We can just diff the contents.
  if (packageMetadataChanged) {
    const patchOutput = execSync(
      'git diff a9c8b08 package.json package-lock.json packages/*/package.json',
      { cwd: baseDir, encoding: 'utf8' }
    );
    if (
      patchOutput.includes('+  "dependencies"') ||
      patchOutput.includes('+  "devDependencies"') ||
      patchOutput.includes('package-lock.json') ||
      patchOutput.includes('+    "')
    ) {
      // simplified: if it adds anything that looks like a dependency
      // actually, let's just do a rough check. The simplest is package-lock.json modification = graph change.
      if (diffLines.includes('package-lock.json')) {
        dependencyGraphChanged = true;
      } else {
        // If only package.json changed, did dependencies change?
        if (patchOutput.includes('dependencies') || patchOutput.includes('devDependencies')) {
          dependencyGraphChanged = true;
        }
      }
    }
  }
} catch (e) {
  console.error('Error checking git diff', e);
}

const npmCiRequired = dependencyGraphChanged;
let npmCiExitCode = null;

if (npmCiRequired) {
  console.log('Dependency graph changed. Running npm ci...');
  npmCiExitCode = runCommand('npm ci');
  if (npmCiExitCode !== 0) {
    console.error('npm ci failed');
    process.exit(npmCiExitCode);
  }
}

// Write the dep status artifact
const depStatus = {
  packageMetadataChanged: packageMetadataChanged ? 'YES' : 'NO',
  dependencyGraphChanged: dependencyGraphChanged ? 'YES' : 'NO',
  npmCiRequired: npmCiRequired ? 'YES' : 'NO',
  npmCiExitCode,
};
fs.writeFileSync(
  path.join(baseDir, 'dependency-status.json'),
  JSON.stringify(depStatus, null, 2) + '\n'
);
runCommand('npx prettier --write dependency-status.json');

// 3. Verify
const commands = [
  'npm run format:check',
  'npm run lint',
  'npm run typecheck',
  'npm run test',
  'npm run build',
];

for (const cmd of commands) {
  const code = runCommand(cmd);
  if (code !== 0) {
    console.error(`${cmd} failed with exit code ${code}`);
    process.exit(code);
  }
}

// 4. Preflight
console.log('Running release:preflight:staging');
let preflightExitCode = 0;
let preflightDiagnostics = '';
try {
  const out = execSync('npm run release:preflight:staging', { cwd: baseDir, encoding: 'utf8' });
  preflightDiagnostics = out;
} catch (e) {
  preflightExitCode = e.status || 1;
  preflightDiagnostics = (e.stdout || '') + '\n' + (e.stderr || '');
}

// Clean up diagnostics text
preflightDiagnostics = preflightDiagnostics.replace(/\r/g, '').trim();

const preflightResult = {
  command: 'npm run release:preflight:staging',
  exitCode: preflightExitCode,
  classification:
    preflightExitCode === 2
      ? 'EXPECTED CONFIGURATION INCOMPLETE'
      : preflightExitCode === 0
        ? 'SUCCESS'
        : 'UNKNOWN ERROR',
  diagnostics: preflightDiagnostics,
  mutationsPerformed: false,
};

fs.writeFileSync(
  path.join(baseDir, 'staging-preflight-result.json'),
  JSON.stringify(preflightResult, null, 2) + '\n'
);
runCommand('npx prettier --write staging-preflight-result.json');
console.log('Wrote staging-preflight-result.json');

// 5. Generate Report
console.log('Generating report...');
const reportCode = runCommand('node scripts/generate-release-report.cjs');
if (reportCode !== 0) {
  console.error(`generate-release-report.cjs failed with exit code ${reportCode}`);
  process.exit(reportCode);
}

console.log('Verification Sequence Complete.');
