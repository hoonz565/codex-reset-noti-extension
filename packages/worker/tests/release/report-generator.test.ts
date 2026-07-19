import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('child_process', () => ({
  execSync: vi.fn((cmd) => {
    if (cmd.includes('git status')) return Buffer.from('');
    if (cmd.includes('git ls-files')) return Buffer.from('');
    if (cmd.includes('release-preflight.cjs')) return Buffer.from('');
    return Buffer.from('');
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const generator = require('../../../../scripts/generate-release-report.cjs');

describe('Release Report Generator (Non-Canonical)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-test-'));
    const packagesDir = path.join(tmpDir, 'packages');
    fs.mkdirSync(packagesDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'scripts'), { recursive: true });
    // Write a dummy preflight script to avoid crashing
    fs.writeFileSync(path.join(tmpDir, 'scripts/release-preflight.cjs'), 'process.exit(2);');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createTestFile(content: string) {
    const filePath = path.join(tmpDir, 'packages/dummy.test.ts');
    fs.writeFileSync(filePath, content);
  }

  it('fails on missing canonical ID', () => {
    createTestFile(`
      it('MOCK-CONFIG-1: Production wrangler.toml uses explicit codex-reset-notifier worker name.', () => {});
    `);
    expect(() => generator.generateReport(tmpDir, true)).toThrow(/Missing expected canonical IDs:/);
  });

  it('fails on duplicate ID', () => {
    const validLines = Object.keys(generator.canonicalRequirements)
      .map((id) => {
        return `it('${id}: ${generator.canonicalRequirements[id]}', () => {});`;
      })
      .join('\n');

    // Add one duplicate
    const duplicate = `it('MOCK-CONFIG-1: Production wrangler.toml uses explicit codex-reset-notifier worker name.', () => {});`;

    createTestFile(validLines + '\n' + duplicate);
    expect(() => generator.generateReport(tmpDir, true)).toThrow(/Duplicate canonical ID found/);
  });

  it('fails on wrong full canonical name', () => {
    let validLines = Object.keys(generator.canonicalRequirements)
      .map((id) => {
        return `it('${id}: ${generator.canonicalRequirements[id]}', () => {});`;
      })
      .join('\n');

    // Break one
    validLines = validLines.replace(
      'MOCK-CONFIG-1: Production wrangler.toml uses explicit codex-reset-notifier worker name.',
      'MOCK-CONFIG-1: Wrong string.'
    );

    createTestFile(validLines);
    expect(() => generator.generateReport(tmpDir, true)).toThrow(
      /Mismatched canonical test name for MOCK-CONFIG-1/
    );
  });

  it('fails on unexpected canonical ID (e.g. old REL-E2E local-contract ID)', () => {
    const validLines = Object.keys(generator.canonicalRequirements)
      .map((id) => {
        return `it('${id}: ${generator.canonicalRequirements[id]}', () => {});`;
      })
      .join('\n');

    // Add old E2E
    const oldE2E = `it('MOCK-E2E-1: Staging GET /api/status returns valid schema and CORS.', () => {});`;

    createTestFile(validLines + '\n' + oldE2E);
    expect(() => generator.generateReport(tmpDir, true)).toThrow(
      /Unexpected canonical ID found: MOCK-E2E-1/
    );
  });

  it('generates successfully with valid complete fixture', () => {
    const validLines = Object.keys(generator.canonicalRequirements)
      .map((id) => {
        return `it('${id}: ${generator.canonicalRequirements[id]}', () => {});`;
      })
      .join('\n');

    createTestFile(validLines);

    const report = generator.generateReport(tmpDir, true);
    expect(report).toContain('PHASE 9 LOCAL READY');
    expect(report).toContain('MOCK-CONFIG-1');
    expect(report).toContain('REL-BOUNDARY-14');
  });
});
