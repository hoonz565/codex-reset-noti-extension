import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Extension Manifest', () => {
  const manifestPath = path.resolve(__dirname, '../manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  it('Manifest uses MV3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('No source-site host permission exists', () => {
    const hosts: string[] = manifest.host_permissions || [];
    const hasSource = hosts.some((h) => h.includes('willcodexquotareset.com'));
    expect(hasSource).toBe(false);
  });
});
