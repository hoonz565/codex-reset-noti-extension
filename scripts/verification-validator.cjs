/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const fs = require('fs');

function validateWorkspaceExecution({ exitCode, jsonPath, startedAt, stdout = '', stderr = '' }) {
  if (exitCode !== 0) {
    return { valid: false, reason: `Process exited with non-zero code: ${exitCode}` };
  }
  if (
    stdout.includes('Worker exited unexpectedly') ||
    stderr.includes('Worker exited unexpectedly') ||
    stdout.includes('close timed out') ||
    stderr.includes('close timed out')
  ) {
    return { valid: false, reason: 'Unexpected worker shutdown text detected' };
  }
  if (!fs.existsSync(jsonPath)) {
    return { valid: false, reason: 'Missing verification-results.json' };
  }
  const stat = fs.statSync(jsonPath);
  if (startedAt && stat.mtimeMs < startedAt) {
    return { valid: false, reason: 'Stale verification-results.json' };
  }
  let parsed;
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    parsed = JSON.parse(raw);
  } catch (e) {
    return { valid: false, reason: 'Malformed JSON: ' + e.message };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, reason: 'Malformed JSON object' };
  }
  if (parsed.interrupted) {
    return { valid: false, reason: 'Interrupted process marker in JSON' };
  }
  if (parsed.numFailedTests > 0 || parsed.numFailedTestSuites > 0) {
    return { valid: false, reason: `Failed tests reported in JSON (${parsed.numFailedTests})` };
  }
  if (parsed.unhandledErrors && parsed.unhandledErrors.length > 0) {
    return {
      valid: false,
      reason: `Unhandled errors reported in JSON (${parsed.unhandledErrors.length})`,
    };
  }
  if (
    typeof parsed.numPassedTests !== 'number' ||
    typeof parsed.numTotalTests !== 'number' ||
    parsed.numPassedTests <= 0 ||
    parsed.numPassedTests !== parsed.numTotalTests
  ) {
    return { valid: false, reason: 'Inconsistent passed-test totals' };
  }
  let calculatedPassed = 0;
  if (Array.isArray(parsed.testResults)) {
    for (const suite of parsed.testResults) {
      if (suite.status === 'failed') {
        return { valid: false, reason: 'Failed test suite found in testResults' };
      }
      if (Array.isArray(suite.assertionResults)) {
        for (const test of suite.assertionResults) {
          if (test.status === 'passed') {
            calculatedPassed++;
          } else if (test.status === 'failed') {
            return { valid: false, reason: `Failed assertion in testResults: ${test.title}` };
          }
        }
      }
    }
  }
  if (calculatedPassed !== parsed.numPassedTests) {
    return { valid: false, reason: 'Inconsistent passed-test totals' };
  }
  return { valid: true, numPassedTests: parsed.numPassedTests };
}

module.exports = {
  validateWorkspaceExecution,
};
