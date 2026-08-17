import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import { beforeAll, describe, expect, it } from 'vitest';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const packageScript = path.join(projectDir, 'scripts', 'package-extension.mjs');
const archivePath = path.join(projectDir, 'extension-release.zip');
const checksumPath = `${archivePath}.sha256`;
const verificationApiOrigin = 'https://codex-reset-notifier.example.workers.dev';

function runPackager(apiOrigin = verificationApiOrigin) {
  execFileSync(process.execPath, [packageScript], {
    cwd: projectDir,
    env: {
      ...process.env,
      WORKER_API_BASE_URL: apiOrigin,
    },
    stdio: 'pipe',
  });
}

function sha256(filePath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readPackage() {
  const zip = new AdmZip(archivePath);
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .sort((a, b) => a.entryName.localeCompare(b.entryName));
  return {
    entries,
    names: entries.map((entry) => entry.entryName),
    content: entries.map((entry) => entry.getData().toString('utf8')).join('\n'),
  };
}

beforeAll(() => runPackager());

describe('Phase 9 extension release package', () => {
  it('REL-PACKAGE-1: Production ZIP excludes tests, source maps, and development files.', () => {
    expect(readPackage().names).toEqual(['manifest.json', 'popup.css', 'popup.html', 'popup.js']);
  });

  it('REL-PACKAGE-2: Production packaging produces a validated ZIP and SHA-256 checksum.', () => {
    const firstHash = sha256(archivePath);
    expect(fs.readFileSync(checksumPath, 'utf8')).toBe(`${firstHash}  extension-release.zip\n`);

    runPackager();
    expect(sha256(archivePath)).toBe(firstHash);
  });

  it('REL-BOUNDARY-1: Extension ZIP contains no upstream source URL.', () => {
    expect(readPackage().content).not.toContain('willcodexquotareset.com/api/forecast');
  });

  it('REL-BOUNDARY-2: Extension ZIP contains no localhost.', () => {
    expect(readPackage().content).not.toMatch(/localhost|127\.0\.0\.1/);
  });

  it('REL-BOUNDARY-3: Production ZIP contains no staging Worker URL.', () => {
    expect(readPackage().content).not.toContain('codex-reset-notifier-staging');
  });

  it('REL-BOUNDARY-4: Extension requests only configured Worker.', () => {
    const releasePackage = readPackage();
    const manifestEntry = releasePackage.entries.find(
      (entry) => entry.entryName === 'manifest.json'
    );
    const popupEntry = releasePackage.entries.find((entry) => entry.entryName === 'popup.js');
    expect(manifestEntry).toBeDefined();
    expect(popupEntry).toBeDefined();

    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    expect(manifest.host_permissions).toEqual([`${verificationApiOrigin}/*`]);
    expect(popupEntry!.getData().toString('utf8')).toContain(verificationApiOrigin);
  });

  it('REL-SEC-2: Extension package contains no secrets or admin tokens.', () => {
    expect(readPackage().content).not.toMatch(
      /ADMIN_API_TOKEN|EMAIL_PROVIDER_API_KEY|RATE_LIMIT_SECRET|Bearer\s+[A-Za-z0-9_-]{16,}/
    );
  });

  it.each([
    ['', 'required'],
    ['http://localhost:8787', 'HTTPS'],
    ['https://codex-reset-notifier-staging.example.workers.dev', 'staging'],
    ['https://willcodexquotareset.com', 'upstream'],
  ])('rejects unsafe package API origin %j', (apiOrigin, expectedMessage) => {
    expect(() => runPackager(apiOrigin)).toThrow(expectedMessage);
  });
});
