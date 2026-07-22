import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
// @ts-expect-error - CJS module import without type definitions
import { validateWorkspaceExecution } from '../../../../scripts/verification-validator.cjs';

describe('Orchestrator Failure Integrity Validation', () => {
  let tmpDir: string;
  let jsonPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-test-'));
    jsonPath = path.join(tmpDir, 'verification-results.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createValidJson(overrides = {}) {
    const base = {
      numPassedTests: 5,
      numTotalTests: 5,
      numFailedTests: 0,
      numFailedTestSuites: 0,
      unhandledErrors: [],
      interrupted: false,
      testResults: [
        {
          status: 'passed',
          assertionResults: [
            { status: 'passed', title: 'test 1' },
            { status: 'passed', title: 'test 2' },
            { status: 'passed', title: 'test 3' },
            { status: 'passed', title: 'test 4' },
            { status: 'passed', title: 'test 5' },
          ],
        },
      ],
    };
    const content = JSON.stringify({ ...base, ...overrides }, null, 2);
    fs.writeFileSync(jsonPath, content);
  }

  it('rejects exit code 1 with all tests recorded PASS', () => {
    createValidJson();
    const result = validateWorkspaceExecution({
      exitCode: 1,
      jsonPath,
      startedAt: Date.now() - 1000,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Process exited with non-zero code: 1');
  });

  it('rejects exit code 137 or forced termination', () => {
    createValidJson();
    const result = validateWorkspaceExecution({
      exitCode: 137,
      jsonPath,
      startedAt: Date.now() - 1000,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Process exited with non-zero code: 137');
  });

  it('rejects unexpected Worker shutdown text in stdout or stderr', () => {
    createValidJson();
    const result = validateWorkspaceExecution({
      exitCode: 0,
      jsonPath,
      startedAt: Date.now() - 1000,
      stderr: 'Error: Worker exited unexpectedly',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unexpected worker shutdown text detected');
  });

  it('rejects unhandled rejection with numFailedTests 0', () => {
    createValidJson({ unhandledErrors: ['Unhandled Rejection error'] });
    const result = validateWorkspaceExecution({
      exitCode: 0,
      jsonPath,
      startedAt: Date.now() - 1000,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unhandled errors reported in JSON');
  });

  it('rejects missing JSON file', () => {
    const nonExistentPath = path.join(tmpDir, 'missing.json');
    const result = validateWorkspaceExecution({
      exitCode: 0,
      jsonPath: nonExistentPath,
      startedAt: Date.now() - 1000,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Missing verification-results.json');
  });

  it('rejects stale JSON file', () => {
    createValidJson();
    const startedAt = Date.now() + 5000;
    const result = validateWorkspaceExecution({ exitCode: 0, jsonPath, startedAt });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Stale verification-results.json');
  });

  it('rejects malformed JSON content', () => {
    fs.writeFileSync(jsonPath, '{ malformed json... ');
    const result = validateWorkspaceExecution({
      exitCode: 0,
      jsonPath,
      startedAt: Date.now() - 1000,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Malformed JSON');
  });

  it('rejects inconsistent passed-test totals', () => {
    // numPassedTests says 5, but testResults only has 4 passed assertionResults
    createValidJson({
      numPassedTests: 5,
      testResults: [
        {
          status: 'passed',
          assertionResults: [
            { status: 'passed', title: 't1' },
            { status: 'passed', title: 't2' },
            { status: 'passed', title: 't3' },
            { status: 'passed', title: 't4' },
          ],
        },
      ],
    });
    const result = validateWorkspaceExecution({
      exitCode: 0,
      jsonPath,
      startedAt: Date.now() - 1000,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Inconsistent passed-test totals');
  });

  it('accepts valid fixture when exit code is 0 and JSON verification passes', () => {
    createValidJson();
    const result = validateWorkspaceExecution({
      exitCode: 0,
      jsonPath,
      startedAt: Date.now() - 1000,
    });
    expect(result.valid).toBe(true);
    expect(result.numPassedTests).toBe(5);
  });
});
